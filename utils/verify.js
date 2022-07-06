const { run } = require("hardhat")

async function verify(contractAddress, args) {
  console.log("Verifying Contract...") // it is nice for outputting the functions because they help us in understanding better while running
  try {
    await run("verify:verify", {
      address: contractAddress,
      constructorArguments: args,
    }) // this is written as such because that is the syntax of this code
  } catch (e) {
    if (e.message.toLowerCase().includes("already verified")) {
      // run to check the error message
      console.log("Already Verified")
    } else {
      console.log(e)
    }
  }
}

module.exports = { verify }
