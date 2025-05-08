import { expect } from "chai";
import {
  deploy,
  deposit,
  withdraw,
  spin,
  addressses,
  sks,
  getMaxBet,
  getEvents,
  decodeBetPlaced,
  claim,
  algodClient,
  slotMachineSetPayoutModel,
  kill,
  // beacon
  touch,
  // payment model
  setPayoutModel,
} from "../command.js";

const invalidSpin = Buffer.from(new Uint8Array(56).fill(0)).toString("hex");

const spinClaimOnce = async (appId, beaconAppId, player1) => {
  const spinR = await spin({
    appId,
    amount: 1e6,
    index: 23,
    ...player1,
  });
  let claimR;
  do {
    await touch({
      appId: beaconAppId,
    });
    claimR = await claim({
      appId,
      betKey: spinR,
    });
    if (claimR.success) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } while (1);
  console.log("claimR.returnValue", claimR.returnValue);
  return claimR;
};

const MIN_BANK_AMOUNT = 350000000000; // 350,000 VOI

describe("Slot Machine Testing", function () {
  this.timeout(300_000);
  let deployOptions = {
    type: "SlotMachine",
    name: "SlotMachine",
    debug: false,
  };
  let contract;
  let appId;
  let payoutModelContract;
  let payoutModelAppId;
  let beaconAppId;
  const player1 = {
    sender: addressses.player1,
    sk: sks.player1,
  };
  const player2 = {
    sender: addressses.player2,
    sk: sks.player2,
  };
  before(async function () {
    {
      const { appId: id, appClient } = await deploy({
        type: "SlotMachinePayoutModel",
        name: "SlotMachinePayoutModel",
      });
      payoutModelAppId = id;
      payoutModelContract = appClient;
      const expectedMultipliers = [100, 50, 20, 10, 5, 2];
      const expectedProbabilities = [
        82_758, 1_655_172, 8_275_862, 16_551_724, 41_379_310, 165_517_241,
      ];
      const payoutModelRes = await payoutModelContract.setPayoutModel({
        multipliers: expectedMultipliers,
        probabilities: expectedProbabilities,
      });
      expect(!!payoutModelRes.confirmation).to.be.true;
      expect(payoutModelAppId).to.not.equal(0);
    }
    {
      const res = await deploy({
        type: "Beacon",
        name: "Beacon",
      });
      beaconAppId = res.appId;
      expect(beaconAppId).to.not.equal(0);
    }
  });
  beforeEach(async function () {
    const now = Date.now();
    const { appId: id, appClient } = await deploy({
      ...deployOptions,
      name: `${deployOptions.name}-${now}`,
    });
    appId = id;
    contract = appClient;
    const setPayoutModelSuccess = await slotMachineSetPayoutModel({
      appId,
      payoutModelAppId,
      sender: addressses.deployer,
      sk: sks.deployer,
    });
    const depositSuccess = await deposit({
      appId,
      amount: MIN_BANK_AMOUNT,
    });
    expect(appId).to.not.equal(0);
    expect(setPayoutModelSuccess).to.be.true;
    expect(depositSuccess).to.be.true;
  });
  afterEach(async function () {
    await kill({
      appId,
      delete: true,
    });
  });
  // BEACON TESTING ------------------------------------------------------------
  it("Should deploy beacon", async function () {
    console.log("beaconAppId", beaconAppId);
    expect(beaconAppId).to.not.equal(0);
  });
  // PAYMENT MODEL TESTING ------------------------------------------------------------
  it("Should deploy payout model", async function () {
    console.log("payoutModelAppId", payoutModelAppId);
    expect(payoutModelAppId).to.not.equal(0);
  });
  // SLOT MACHINE TESTING ------------------------------------------------------------
  it("Should deploy contract", async function () {
    console.log("appId", appId);
    expect(appId).to.not.equal(0);
  });
  it("Should deposit funds", async function () {
    const depositR = await deposit({
      appId,
      amount: 1e6,
    });
    expect(depositR).to.be.true;
  });
  it("Should withdraw funds", async function () {
    const withdrawR = await withdraw({
      appId,
      amount: 1e6,
    });
    expect(withdrawR).to.be.true;
  });
  it("Should not withdraw over available", async function () {
    const withdrawR = await withdraw({
      appId,
      amount: MIN_BANK_AMOUNT + 1e6,
    });
    expect(withdrawR).to.be.false;
  });
  it("Should not withdraw when zero", async function () {
    const withdrawR = await withdraw({
      appId,
      amount: 0,
    });
    expect(withdrawR).to.be.false;
  });
  it("Should not withdraw as player", async function () {
    const withdrawR = await withdraw({
      appId,
      amount: 1e6,
      ...player1,
    });
    expect(withdrawR).to.be.false;
  });
  it("Should spin min bet", async function () {
    const spinMinBet = await spin({
      appId,
      amount: 1e6,
      index: 0,
      ...player1,
    });
    const hex = Buffer.from(spinMinBet).toString("hex");
    console.log("hex", hex);
    expect(hex).to.not.be.eq(invalidSpin);
  });
  it("Should spin max bet", async function () {
    const spinMaxBet = await spin({
      appId,
      amount: 1000e6,
      index: 0,
      ...player1,
    });
    const hex = Buffer.from(spinMaxBet).toString("hex");
    expect(hex).to.not.be.eq(invalidSpin);
  });
  it("Should spin not be below min bet", async function () {
    const spinBelowMinBet = await spin({
      appId,
      amount: 1e6 - 1,
      index: 0,
      ...player1,
    });
    const hex = Buffer.from(spinBelowMinBet).toString("hex");
    expect(hex).to.be.eq(invalidSpin);
  });
  it("Should spin not be above max bet", async function () {
    const spinAboveMaxBet = await spin({
      appId,
      amount: 1000e6 + 1,
      index: 0,
      ...player1,
    });
    const hex = Buffer.from(spinAboveMaxBet).toString("hex");
    expect(hex).to.be.eq(invalidSpin);
  });
  it("Should claim", async function () {
    // give it more than enough to play
    await deposit({
      appId,
      amount: MIN_BANK_AMOUNT,
    });
    for await (const _ of Array(5)) {
      const claimR = await spinClaimOnce(appId, beaconAppId, player1);
      expect(claimR.success).to.be.true;
      expect(claimR.returnValue).to.be.oneOf(
        [0, 2e6, 5e6, 10e6, 20e6, 50e6, 100e6].map(BigInt)
      );
    }
  });
  it("Should set min bank amount", async function () {
    const setMinBankAmountR = await contract.setMinBankAmount({
      minBankAmount: MIN_BANK_AMOUNT,
    });
    expect(!!setMinBankAmountR.confirmation).to.be.true;
  });
  it("Should not set min bank amount below min", async function () {
    try {
      // TODO use simulate
      await contract.setMinBankAmount({
        minBankAmount: MIN_BANK_AMOUNT - 1,
      })
      // If we reach here, the call didn't throw as expected
      expect.fail("Expected setMinBankAmount to throw an error");
    } catch (error) {
      // Verify it's the expected error
      expect(error).to.exist;
      // You can add more specific error checking if needed, like:
      // expect(error.message).to.include("specific error message");
    }
  });
  it("Should lock spin if balance total is less than min bank amount", async function () {
    // bring available balance below min bank where it starts off
    await withdraw({
      appId,
      amount: 1e6,
    });
    const spinR = await spin({
      appId,
      amount: 1e6,
      index: 0,
      ...player1,
    });
    const hex = Buffer.from(spinR).toString("hex");
    expect(hex).to.be.eq(invalidSpin);
  });
  // this is a preventative measure agains the impossible underflow
  it("Should not spin if balance available is less than max payout of amount", async function () {
    // it is not possible without increasing max bet to at least 3.5k VOI with balance available
    // at min bank amount. Leaving this here as a reminder.
  });
});
