const { expect, assert } = require("chai")
const { network, ethers } = require("hardhat")
const {
  isCallTrace,
} = require("hardhat/internal/hardhat-network/stack-traces/message-trace")
const { developmentChains } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle Unit Tests", function () {
      let raffle, vrfCoordinatorV2Mock, deployer, raffleInterval, raffleState
      const chainId = network.config.chainId

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        console.log(deployer)
        raffle = await ethers.getContract("Raffle", deployer)
        entryFee = await raffle.getEntryFee() // to enter the transaction
        raffleState = await raffle.getRaffleState() // tells the state of the contract
        console.log(raffleState)
        console.log(entryFee.toString())
      })

      describe("fulfillRandomWords", () => {
        it("Works with live Chainlink Keepers and Chainlink VRF, to get us a random winner", async () => {
          const startTimeStamp = await raffle.getLatestTimestamp()
          const accounts = await ethers.getSigners()

          await new Promise(async (resolve, reject) => {
            raffle.once("WinnerPicked", async () => {
              console.log("WinnerPicked event fired!")
              try {
                const recentWinner = await raffle.getRecentWinner()
                console.log(`Recent winner is: ${recentWinner}`)
                raffleState = await raffle.getRaffleState()
                console.log(`Raffle is in ${raffleState} state`)
                const winnerEndingBalance = await accounts[0].getBalance()
                console.log(`Winner ending balance is ${winnerEndingBalance}`)
                const endingTimeStamp = await raffle.getLatestTimestamp()
                console.log(`Ending time stamp is ${endingTimeStamp}`)

                //const gasCost = gasUsed.mul(effectiveGasPrice)

                await expect(raffle.getPlayer(0)).to.be.reverted
                assert.equal(recentWinner.toString(), accounts[0].address)
                assert.equal(raffleState, 0)
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(entryFee).toString()
                )
                assert(endingTimeStamp > startingTimestamp)
                resolve()
              } catch (e) {
                console.log(e)
                resolve(e)
              }
            })
            const tx = await raffle.enterRaffle({ value: entryFee })
            const txReceipt = tx.wait(1)
            console.log("Just a sec...")
            const winnerStartingBalance = await accounts[0].getBalance()
            console.log(`Winner starting balance is ${winnerStartingBalance}`)
            const startingTimeStamp = await raffle.getLatestTimestamp()
            console.log(`Starting time stamp is ${startTimeStamp}`)
          })
        })
      })
    })
