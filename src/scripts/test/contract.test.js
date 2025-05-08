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
  // beacon
  touch,
  // payment model
  setPayoutModel,
} from "../command.js";

const invalidSpin =
  "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

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
      ...player1,
    });
    if (claimR.success) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } while (1);
  console.log("claimR.returnValue", claimR.returnValue);
  return claimR;
};

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
        name: "SlotMachinePayoutModelxxx",
      });
      payoutModelAppId = id;
      payoutModelContract = appClient;
    }
    {
      const res = await deploy({
        type: "Beacon",
        name: "Beacon001",
      });
      beaconAppId = res.appId;
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
      amount: 300_000e6,
    });
    expect(appId).to.not.equal(0);
    expect(setPayoutModelSuccess).to.be.true;
    expect(depositSuccess).to.be.true;
  });
  afterEach(async function () {});
  // BEACON TESTING
  it("Should deploy beacon", async function () {
    console.log("beaconAppId", beaconAppId);
    expect(beaconAppId).to.not.equal(0);
  });
  // PAYMENT MODEL TESTING
  it("Should deploy payout model", async function () {
    console.log("payoutModelAppId", payoutModelAppId);
    expect(payoutModelAppId).to.not.equal(0);
  });
  it("Should set payout model", async function () {
    await payoutModelContract.setPayoutModel({
      multipliers: [100, 50, 20, 10, 5, 2],
      probabilities: [
        82_758, 1_655_172, 8_275_862, 16_551_724, 41_379_310, 165_517_241,
      ],
    });
    const payoutModel = (await payoutModelContract.getPayoutModel()).return;
  });
  // // SLOT MACHINE TESTING
  // it("Should deploy contract", async function () {
  //   console.log("appId", appId);
  //   expect(appId).to.not.equal(0);
  //   // check owner
  // });
  // it("Should deposit funds", async function () {
  //   // check initial state
  //   const depositR = await deposit({
  //     appId,
  //     amount: 1e6,
  //   });
  //   // check state after deposit
  //   expect(depositR).to.be.true;
  // });
  // it("Should withdraw funds", async function () {
  //   const withdrawR = await withdraw({
  //     appId,
  //     amount: 1e6,
  //   });
  //   expect(withdrawR).to.be.true;
  // });
  // it("Should not withdraw over available", async function () {
  //   const withdrawR = await withdraw({
  //     appId,
  //     amount: 300_000e6 + 1e6,
  //   });
  //   expect(withdrawR).to.be.false;
  // });
  // it("Should not withdraw when zero", async function () {
  //   const withdrawR = await withdraw({
  //     appId,
  //     amount: 0,
  //   });
  //   expect(withdrawR).to.be.false;
  // });
  // it("Should not withdraw as player", async function () {
  //   const withdrawR = await withdraw({
  //     appId,
  //     amount: 1e6,
  //     ...player1,
  //   });
  //   expect(withdrawR).to.be.false;
  // });
  // // it should withdraw minor
  // // it should withdraw all
  // // it should withdraw ...
  // it("Should spin min bet", async function () {
  //   const spinMinBet = await spin({
  //     appId,
  //     amount: 1e6,
  //     index: 0,
  //     ...player1,
  //     debug: true,
  //   });
  //   const hex = Buffer.from(spinMinBet).toString("hex");
  //   expect(hex).to.not.be.eq(invalidSpin);
  // });
  // it("Should spin max bet", async function () {
  //   const spinMaxBet = await spin({
  //     appId,
  //     amount: 1000e6,
  //     index: 0,
  //     ...player1,
  //   });
  //   const hex = Buffer.from(spinMaxBet).toString("hex");
  //   expect(hex).to.not.be.eq(invalidSpin);
  // });
  // it("Should spin not be below min bet", async function () {
  //   const spinBelowMinBet = await spin({
  //     appId,
  //     amount: 1e6 - 1,
  //     index: 0,
  //     ...player1,
  //   });
  //   const hex = Buffer.from(spinBelowMinBet).toString("hex");
  //   expect(hex).to.be.eq(invalidSpin);
  // });
  // it("Should spin not be above max bet", async function () {
  //   const spinAboveMaxBet = await spin({
  //     appId,
  //     amount: 1000e6 + 1,
  //     index: 0,
  //     ...player1,
  //   });
  //   const hex = Buffer.from(spinAboveMaxBet).toString("hex");
  //   expect(hex).to.be.eq(invalidSpin);
  // });
  // it("Should claim", async function () {
  //   for await (const _ of Array(100)) {
  //     const claimR = await spinClaimOnce(appId, beaconAppId, player1);
  //     expect(claimR.success).to.be.true;
  //     expect(claimR.returnValue).to.be.oneOf(
  //       [0, 2e6, 5e6, 10e6, 20e6, 50e6, 100e6].map(BigInt)
  //     );
  //   }
  // });
});
