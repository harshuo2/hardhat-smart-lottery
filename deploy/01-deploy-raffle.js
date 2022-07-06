const { network } = require("hardhat")
const { developmentChains, networkConfig } = require("../helper-hardhat-config")
const { verify } = require("../utils/verify")

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deployer } = await getNamedAccounts()
  const { log, deploy } = deployments
  const chainId = network.config.chainId

  let vrfCoordinatorV2address, subscriptionId
  // on to the deployment part
  if (developmentChains.includes(network.name)) {
    const vrfCoordinatorV2Contract = await ethers.getContract(
      "VRFCoordinatorV2Mock"
    )
    vrfCoordinatorV2address = vrfCoordinatorV2Contract.address
    const transactionResponse =
      await vrfCoordinatorV2Contract.createSubscription()
    const transactionReceipt = await transactionResponse.wait(1)
    subscriptionId = transactionReceipt.events[0].args.subId // we got this from our events
    //funding subscription
    await vrfCoordinatorV2Contract.fundSubscription(
      subscriptionId,
      ethers.utils.parseEther("10")
    )
  } else {
    vrfCoordinatorV2address = networkConfig[chainId]["vrfCoordinatorV2"]
    subscriptionId = networkConfig[chainId]["subscriptionId"] // declare it in the helper-hardhat-config kingu
  }
  const entryFee = networkConfig[chainId]["entryFee"]
  const keyHash = networkConfig[chainId]["keyHash"]
  const callbackGasLimit = networkConfig[chainId]["callbackGasLimit"]
  const interval = networkConfig[chainId]["interval"]

  const args = [
    vrfCoordinatorV2address,
    entryFee,
    keyHash,
    subscriptionId,
    callbackGasLimit,
    interval,
  ]

  const raffle = await deploy("Raffle", {
    from: deployer,
    args: args,
    log: true,
    waitConfirmations: networkConfig.blockConfirmations || 1,
  })
  log("Deployed the contracts!")

  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    log("Verification begins!!")
    await verify(raffle.address, args)
    log("Verified ^_^")
  }
  log("---------------------------------------------------")
}

module.exports.tags = ["all", "raffle"]
