const { inputToConfig } = require("@ethereum-waffle/compiler")
const { assert, expect } = require("chai")
const { deployments, network, getNamedAccounts, ethers } = require("hardhat")
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle Unit Tests", function () {
      let raffle, vrfCoordinatorV2Mock, deployer, raffleInterval, raffleState
      const chainId = network.config.chainId

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer
        await deployments.fixture(["all"]) // saare scripts deployed
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        )
        raffle = await ethers.getContract("Raffle", deployer)
        raffleInterval = await raffle.getInterval() // needed to increase evm time by a unit and also to check if constructor is working
        entryFee = await raffle.getEntryFee() // to enter the transaction
        raffleState = await raffle.getRaffleState() // tells the state of the contract
      })

      describe("contructor", function () {
        it("checks to see if things are in order for us to continue", async function () {
          assert.equal(raffleState.toString(), "0")
          assert.equal(
            raffleInterval.toString(),
            networkConfig[chainId]["interval"]
          )
        })
      })

      describe("enterRaffle", function () {
        it("enough Ether was passed", async function () {
          await expect(raffle.enterRaffle()).to.be.reverted
        })

        it("Player has entered", async function () {
          await raffle.enterRaffle({ value: entryFee })
          assert.equal(await raffle.getPlayer(0), deployer)
        })

        it("RaffleEnter event called", async function () {
          const raffleObject = await raffle.enterRaffle({ value: entryFee })
          await expect(raffleObject).to.emit(raffle, "RaffleEnter")
        })

        it("Raffle is in calculating state", async function () {
          // here we basically had to set it in CALCULATING mode. This is achieved only in the performUpkeep function. Thus, we did all of this shit here
          await raffle.enterRaffle({ value: entryFee })
          await network.provider.send("evm_increaseTime", [
            raffleInterval.toNumber() + 1,
          ])
          await network.provider.send("evm_mine", [])
          // we went thru the above steps because, we had to have the checkUpkeep return that we are ready for performing the Upkeep.
          // now all requirements, except time passed, were passing, so we performed that on our own
          await raffle.performUpkeep([]) // raffle can now be set to calculating state...
          await expect(raffle.enterRaffle({ value: entryFee })).to.be.reverted
        })
      })
      describe("checkUpkeep", function () {
        it("returns false if people haven't sent any ETH", async () => {
          await network.provider.send("evm_increaseTime", [
            raffleInterval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
          assert(!upkeepNeeded)
        })
        it("returns false if raffle isn't open", async () => {
          await raffle.enterRaffle({ value: entryFee })
          await network.provider.send("evm_increaseTime", [
            raffleInterval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          await raffle.performUpkeep([])
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
          assert.notEqual(raffleState.toString() == "1", upkeepNeeded == false)
        })
        it("returns false if enough time hasn't passed", async () => {
          await raffle.enterRaffle({ value: entryFee })
          await network.provider.send("evm_increaseTime", [
            raffleInterval.toNumber() - 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
          assert.notEqual(upkeepNeeded)
        })
        it("returns true if enough time has passed, has players, eth, and is open", async () => {
          await raffle.enterRaffle({ value: entryFee })
          await network.provider.send("evm_increaseTime", [
            raffleInterval.toNumber() + 1,
          ])
          await network.provider.request({ method: "evm_mine", params: [] })
          const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x")
          assert(upkeepNeeded)
        })
      })

      describe("performUpkeep", function () {
        it("returns true if only check upkeep is working", async function () {
          // and when is checkUpkeep true? when all four conditions are met[check contract]
          await raffle.enterRaffle({ value: entryFee })
          await network.provider.send("evm_increaseTime", [
            raffleInterval.toNumber() + 1,
          ])
          await network.provider.send("evm_mine", [])
          const tx = await raffle.performUpkeep([]) // tx will return true if only performUpkeep will work or all requirements are met
          assert(tx)
        })
        it("reverts if upkeep is not needed", async function () {
          await expect(await raffle.performUpkeep([])).to.be.reverted
        })
        it("tests if raffle is CALCULATING, emits an event, and calls the vrf coordinator", async function () {
          await raffle.enterRaffle({ value: entryFee })
          await network.provider.send("evm_increaseTime", [
            raffleInterval.toNumber() + 1,
          ])
          await network.provider.send("evm_mine", [])
          const txResponse = await raffle.performUpkeep([])
          const txReceipt = await txResponse.wait(1)
          //const requestId = await txReceipt.events[1].args.requestId // upar ka func emits an event
          // why did we get the requestId? to emit the event "RequestRaffleWinner"
          const requestId = txReceipt.events[1].args[0]
          raffleState = await raffle.getRaffleState()
          assert.equal(raffleState.toString(), "1")
          assert(requestId.toNumber() > 0)
        })
      })
      describe("fulfillRandomWords", function () {
        beforeEach(async () => {
          // we want some player to have entered to decide on a winner
          await raffle.enterRaffle({ value: entryFee })
          await network.provider.send("evm_increaseTime", [
            raffleInterval.toNumber() + 1,
          ])
          await network.provider.send("evm_mine", [])
        })
        it("can only be called if performUpkeep is allowed", async function () {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address)
          ).to.be.revertedWith("nonexistent request")
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address)
          ).to.be.revertedWith("nonexistent request")
        })

        it("picks a winner, resets the array, and send the money", async function () {
          const additionalEntrants = 3
          const startingPlayerIndex = 1 // as deployer = 0
          const accounts = await ethers.getSigners()
          for (
            let i = startingPlayerIndex;
            i < startingPlayerIndex + additionalEntrants;
            i++
          ) {
            const accountConnectedRaffle = raffle.connect(accounts[i])
            await accountConnectedRaffle.enterRaffle({ value: entryFee })
          }
          // we also store the latest time stamps
          const startingTimeStamp = await raffle.getLatestTimestamp()

          // we wait for the event to finish so we set up a listener to listen for the event
          // now since we are waiting, we need to make a new promise (await)
          await new Promise(async (resolve, reject) => {
            // we run this event and then accordingly, do something when we (have) listen(ed) for the event
            raffle.once("WinnerPicked", async () => {
              // what all to do when this event is called... write here
              //so what we have done here is that we have set a timer of 200sec. If the event does not fire in 200s, we will return with an error
              console.log("Found the event!!")
              try {
                const recentWinner = await raffle.getRecentWinner()
                console.log(recentWinner)
                console.log(accounts[0].address)
                console.log(accounts[1].address)
                console.log(accounts[2].address)
                console.log(accounts[3].address)
                raffleState = await raffle.getRaffleState()
                const endingTimeStamp = await raffle.getLatestTimestamp()
                const numPlayers = await raffle.getNumberOfPlayers()
                const endingPlayerBalance = await accounts[1].getBalance()
                assert.equal(numPlayers.toString(), "0")
                assert.equal(raffleState.toString(), "0")
                assert(endingTimeStamp > startingTimeStamp)
                assert.equal(
                  endingPlayerBalance.toString(),
                  startingPlayerBalance.add(
                    entryFee.mul(additionalEntrants).add(entryFee).toString()
                  )
                )
              } catch (e) {
                reject(e)
              }
              resolve()
            })
            const tx = await raffle.performUpkeep([]) // mocked chainlink keepers
            const txReceipt = await tx.wait(1)
            const startingPlayerBalance = await accounts[1].getBalance()
            await vrfCoordinatorV2Mock.fulfillRandomWords(
              // mocked chainlink vrf
              txReceipt.events[1].args[0],
              raffle.address
            )
          })
        })
      })
    })
