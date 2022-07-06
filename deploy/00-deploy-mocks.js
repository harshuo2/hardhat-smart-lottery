const { ethers, network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config")

module.exports = async function ({ deployments, getNamedAccounts }) {
  const { deploy, log } = deployments
  const { deployer } = await getNamedAccounts()
  //const chainId = network.config.chainId
  log("error?")
  const BASE_FEE = ethers.utils.parseEther("0.25")
  const GAS_PRICE_LINK = 1e9
  const args = [BASE_FEE, GAS_PRICE_LINK]

  if (developmentChains.includes(network.name)) {
    log("Deploying Mocks!")
    const vrfCoordinatorV2Mock = await deploy("VRFCoordinatorV2Mock", {
      from: deployer,
      args: args,
      log: true,
    })
    log("Mocks Deployed!!")
    log("--------------------------------------------------------------------")
  }
}

module.exports.tags = ["all", "mock"]
