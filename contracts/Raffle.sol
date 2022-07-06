// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
import "@chainlink/contracts/src/v0.8/interfaces/KeeperCompatibleInterface.sol";

// Enter the lottery:
// Pick a random winner (untemperable)
// Run automatically after a particular time...
contract Raffle is VRFConsumerBaseV2, KeeperCompatibleInterface {
  // we have now made Raffle VRFable (verifiable random number)
  // we want to user to define what fix value we will input.

  /* Errors */
  error Raffle__notEnoughEthEntered();
  error Raffle__TransferFailed();
  error Raffle__stateNotOpen();
  error Raffle__UpkeepNotNeeded(
    uint256 currentBalance,
    uint256 currentPlayers,
    uint256 raffleState
  );

  /* Type Variables */
  enum RaffleState {
    OPEN,
    CALCULATING
  } // uint256, it means a type of array where 0= OPEN, 1= CALCULATING but written explicitly, and not in symbols and shit

  /* State Variables */
  uint256 private immutable i_entryFee;
  address payable[] private s_players;
  VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
  bytes32 private immutable i_keyHash;
  uint64 private immutable i_subscriptionId;
  uint16 private constant REQUEST_CONFIRMATIONS = 3; // we wait for 3 block confirmations
  uint32 private immutable i_callbackGasLimit;
  uint32 private constant NUM_WORDS = 1; // only 1 word will be returned

  /* Lottery Variables */
  address payable s_recentWinner;
  RaffleState private s_raffleState;
  uint256 private immutable i_interval;
  uint256 private s_lastTimeStamp;

  /* Events */
  event RaffleEnter(address indexed player);
  event RequestedRaffleWinner(uint256 indexed winner);
  event WinnerPicked(address indexed winner);

  /* Functions */
  constructor(
    address vrfCoordinatorV2,
    uint256 entryFee,
    bytes32 keyHash,
    uint64 subscriptionId,
    uint32 callbackGasLimit,
    uint256 interval
  ) VRFConsumerBaseV2(vrfCoordinatorV2) {
    // through this way, we have initialised the constructor of the parent class too..
    i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
    i_entryFee = entryFee;
    i_keyHash = keyHash;
    i_subscriptionId = subscriptionId;
    i_callbackGasLimit = callbackGasLimit;
    s_raffleState = RaffleState.OPEN;
    i_interval = interval;
    s_lastTimeStamp = block.timestamp;
  }

  function enterRaffle() public payable {
    //require msg.value>i_entryFee
    if (msg.value < i_entryFee) {
      revert Raffle__notEnoughEthEntered();
    }
    if (s_raffleState != RaffleState.OPEN) {
      revert Raffle__stateNotOpen();
    }
    s_players.push(payable(msg.sender));
    emit RaffleEnter(msg.sender);
  }

  /**
   *@dev the KeeperCompatibleInterface is meant for automation of the extraction of winner
   * They look for the 'upkeepNeeded' to return true
   * The following conditions should be satisfied for it to return true:
   * 1. Our time interval should've passed
   * 2. The Raffle should have atleast 1 player and some balance in it
   * 3. Our subscription should be funded with LINK
   * 4. Lottery should be in open state...
   */
  function checkUpkeep(
    bytes memory /* checkData */
  )
    public
    view
    override
    returns (
      bool upkeepNeeded,
      bytes memory /* performData*/
    )
  {
    // making a function of type bytes actually kind of makes a template class, where we can now pass it to be of any type...
    bool isOpen = (RaffleState.OPEN == s_raffleState);
    bool timePassed = ((block.timestamp - s_lastTimeStamp) > i_interval);
    bool hasPlayers = (s_players.length > 0);
    bool hasBalance = (address(this).balance > 0);
    upkeepNeeded = (isOpen && timePassed && hasBalance && hasPlayers);
    return (upkeepNeeded, "0x0");
  }

  /**
   * @dev the performUpkeep function is written to perform the execution of some task after checkUpkeep is passed
   * this earlier was the requestRandomWinner function but since that is the task that we want to perform, we transform it...
   * the performData is some other value that we want to return with the checkUpkeep function, but we have nothing to return rn
   * this function should only be called if the callUpkeep function is true. So...
   */
  function performUpkeep(
    bytes calldata /* performData */
  ) external override {
    // we made this function to be external because we wont call it from inside our function, and overall external fun are cheaper
    // pick a Random Winner
    // do something with it
    // 2 transaction process
    (bool upkeepNeeded, ) = checkUpkeep(""); // "" because we dont want to pass anything in the calldata of checkupkeep
    if (!upkeepNeeded) {
      revert Raffle__UpkeepNotNeeded(
        address(this).balance,
        s_players.length,
        uint256(s_raffleState)
      );
    }
    s_raffleState = RaffleState.CALCULATING;
    uint256 requestId = i_vrfCoordinator.requestRandomWords(
      i_keyHash,
      i_subscriptionId,
      REQUEST_CONFIRMATIONS,
      i_callbackGasLimit,
      NUM_WORDS
    ); // this will return a uint256 which we can store
    emit RequestedRaffleWinner(requestId);
  }

  function fulfillRandomWords(
    uint256, /*requestId*/ // we know you need uint256 but we won't use requestId
    uint256[] memory randomWords
  ) internal override {
    uint256 indexOfRandomWinner = randomWords[0] % s_players.length; // s_players is the player array with all the players in there.
    address payable recentWinner = s_players[indexOfRandomWinner];
    s_recentWinner = recentWinner;
    s_lastTimeStamp = block.timestamp;
    (bool success, ) = recentWinner.call{value: address(this).balance}(""); // kya matlab hua vro T_T
    if (!success) {
      revert Raffle__TransferFailed();
    }
    s_players = new address payable[](0);
    s_raffleState = RaffleState.OPEN;
    emit WinnerPicked(recentWinner);
  }

  /* View and Pure functions */

  function getEntryFee() public view returns (uint256) {
    return i_entryFee;
  }

  function getPlayer(uint256 index) public view returns (address) {
    return s_players[index];
  }

  function getRecentWinner() public view returns (address) {
    return s_recentWinner;
  }

  function getRaffleState() public view returns (RaffleState) {
    return s_raffleState;
  }

  function getNumWords() public pure returns (uint256) {
    return NUM_WORDS;
  }

  function getNumberOfPlayers() public view returns (uint256) {
    return s_players.length;
  }

  function getLatestTimestamp() public view returns (uint256) {
    return s_lastTimeStamp;
  }

  function getRequestConfirmations() public pure returns (uint256) {
    return REQUEST_CONFIRMATIONS;
  }

  function getInterval() public view returns (uint256) {
    return i_interval;
  }
}
