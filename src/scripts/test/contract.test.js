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
} from "../command.js";

describe("Slot Machine Testing", function () {
  this.timeout(60_000);
  let deployOptions = {
    type: "SlotMachine",
    name: "SlotMachine",
    debug: false,
  };
  let contract;
  let appId;
  const player1 = {
    sender: addressses.player1,
    sk: sks.player1,
  };
  const player2 = {
    sender: addressses.player2,
    sk: sks.player2,
  };
  beforeEach(async function () {
    const now = Date.now();
    const { appId: id, appClient } = await deploy({
      ...deployOptions,
      name: `${deployOptions.name}-${now}`,
    });
    appId = id;
    contract = appClient;
    expect(appId).to.not.equal(0);
  });

  afterEach(async function () {});

  it("Should deploy contract", async function () {
    console.log(appId);
    expect(appId).to.not.equal(0);
    // check owner
  });

  it("Should deposit funds", async function () {
    // check initial state
    const depositR = await deposit({
      appId,
      amount: 1e6,
    });
    // check state after deposit
    expect(depositR).to.be.true;
  });

  it("Should withdraw funds", async function () {
    // check initial state
    await deposit({
      appId,
      amount: 1e6,
    });
    const canWithdrawOverAvailable = await withdraw({
      appId,
      amount: 2e6,
    });
    const canWithdrawAsPlayer = await withdraw({
      appId,
      amount: 1,
      sender: addressses.player1,
      sk: sks.player1,
    });
    const canWithdrawMinor = await withdraw({
      appId,
      amount: 1,
    });
    const canWithdrawAll = await withdraw({
      appId,
      amount: 1e6 - 1,
    });
    const canWithdrawWhenZero = await withdraw({
      appId,
      amount: 1,
    });
    // check state after withdrawals
    console.log({
      canWithdrawOverAvailable,
      canWithdrawAsPlayer,
      canWithdrawMinor,
      canWithdrawAll,
      canWithdrawWhenZero,
    });
    expect(canWithdrawOverAvailable).to.be.false;
    expect(canWithdrawAsPlayer).to.be.false;
    expect(canWithdrawMinor).to.be.true;
    expect(canWithdrawAll).to.be.true;
    expect(canWithdrawWhenZero).to.be.false;
  });

  it("Should spin", async function () {
    // check initial state
    await deposit({
      appId,
      amount: 1000e6,
      debug: true,
    });
    const spinMinBet = await spin({
      appId,
      amount: 1e6,
      index: 0,
      ...player1,
      debug: true,
    });
    const spinZeroIndex = await spin({
      appId,
      amount: 1e6,
      index: 0,
      ...player1,
      debug: true,
    });
    const spinNonzeroIndex = await spin({
      appId,
      amount: 1e6,
      index: 1,
      ...player1,
      debug: true,
    });
    const spinAboveMinBet = await spin({
      appId,
      amount: 1e6 + 1,
      index: 0,
      ...player1,
      debug: true,
    });
    const spinLessThanMinBet = await spin({
      appId,
      amount: 1,
      index: 0,
      ...player1,
      debug: true,
    });
    const maxBet = await getMaxBet({
      appId,
      ...player1,
      debug: true,
    });
    const spinMaxBet = await spin({
      appId,
      amount: maxBet,
      index: 0,
      ...player1,
      debug: true,
    });
    const spinAboveMaxBet = await spin({
      appId,
      amount: maxBet + 1,
      index: 0,
      ...player1,
      debug: true,
    });
    await deposit({
      appId,
      amount: 1000e6,
      debug: true,
    });
    const spinMinIndex = await spin({
      appId,
      amount: 1e6,
      index: 0,
      ...player1,
      debug: true,
    });
    const spinMaxIndex = await spin({
      appId,
      amount: 1e6,
      index: 23,
      ...player1,
      debug: true,
    });
    const spinAboveMaxIndex = await spin({
      appId,
      amount: 1e6,
      index: 24,
      ...player1,
      debug: true,
    });
    console.log({
      spinMinBet: Buffer.from(spinMinBet).toString("hex"),
      spinZeroIndex: Buffer.from(spinZeroIndex).toString("hex"),
      spinNonzeroIndex: Buffer.from(spinNonzeroIndex).toString("hex"),
      spinAboveMinBet: Buffer.from(spinAboveMinBet).toString("hex"),
      spinLessThanMinBet: Buffer.from(spinLessThanMinBet).toString("hex"),
      spinMaxBet: Buffer.from(spinMaxBet).toString("hex"),
      spinAboveMaxBet: Buffer.from(spinAboveMaxBet).toString("hex"),
      spinMinIndex: Buffer.from(spinMinIndex).toString("hex"),
      spinMaxIndex: Buffer.from(spinMaxIndex).toString("hex"),
      spinAboveMaxIndex: Buffer.from(spinAboveMaxIndex).toString("hex"),
    });
    // check state after spin
    const invalidSpin =
      "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
    expect(Buffer.from(spinMinBet).toString("hex")).to.not.be.eq(invalidSpin);
    expect(Buffer.from(spinZeroIndex).toString("hex")).to.not.be.eq(
      invalidSpin
    );
    expect(Buffer.from(spinNonzeroIndex).toString("hex")).to.not.be.eq(
      invalidSpin
    );
    expect(Buffer.from(spinAboveMinBet).toString("hex")).to.not.be.eq(
      invalidSpin
    );
    expect(Buffer.from(spinLessThanMinBet).toString("hex")).to.be.eq(
      invalidSpin
    );
    expect(Buffer.from(spinMaxBet).toString("hex")).to.not.be.eq(invalidSpin);
    expect(Buffer.from(spinAboveMaxBet).toString("hex")).to.be.eq(invalidSpin);
    expect(Buffer.from(spinMinIndex).toString("hex")).to.not.be.eq(invalidSpin);
    expect(Buffer.from(spinMaxIndex).toString("hex")).to.not.be.eq(invalidSpin);
    expect(Buffer.from(spinAboveMaxIndex).toString("hex")).to.be.eq(
      invalidSpin
    );
  });
  it("Should claim", async function () {
    await deposit({
      appId,
      amount: 100000e6,
    });
    const boxKeys = [];
    for await (const futureRoundOffset of [0, 1, 2, 3, 4, 5]) {
      for await (const index of [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23,
      ]) {
        boxKeys.push(
          await spin({
            appId,
            amount: 1e6 + index,
            index,
            futureRoundOffset,
            ...player1,
          })
        );
      }
    }

    console.log(boxKeys);
    while (boxKeys.length > 0) {
      const boxKey = boxKeys.pop();
      // let events;
      // do {
      //   events = await getEvents(appId);
      //   if (
      //     [
      //       ...Object.values(events)
      //         .map(({ events }) => events)
      //         .flat(),
      //     ].length >= boxKeys.length
      //   )
      //     break;
      //   await new Promise((resolve) => setTimeout(resolve, 1000));
      // } while (1);
      // const BetPlaced = decodeBetPlaced(
      //   events.find(({ name }) => name === "BetPlaced")?.events?.slice(-1)[0]
      // );
      // console.log({ BetPlaced });
      // do {
      //   const status = await algodClient.status().do();
      //   if (status["last-round"] > BetPlaced.round + 1) {
      //     console.log(BetPlaced.round + 1, status["last-round"]);
      //     break;
      //   }
      //   await deposit({
      //     appId,
      //     amount: 1,
      //     ...player1,
      //   });
      // } while (1);
      let attempts = 0;
      const maxAttempts = 15;
      let result;

      while (attempts < maxAttempts) {
        try {
          result = await claim({
            appId,
            betKey: boxKey,
            ...player1,
            debug: true,
          });
          if (!result.success) {
            throw new Error("Claim failed");
          }
          console.log(`Claim succeeded for betKey: ${boxKey}`, result);
          break; // Success - exit retry loop
        } catch (error) {
          attempts++;
          console.log(
            `Claim attempt ${attempts} failed for betKey: ${boxKey}`,
            error.message
          );
          if (attempts === maxAttempts) {
            console.error(
              `Failed to claim after ${maxAttempts} attempts for betKey: ${boxKey}`
            );
          } else {
            await deposit({
              appId,
              amount: 1,
              ...player1,
            });
            // Wait before retrying (with exponential backoff)
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * attempts)
            );
          }
        }
      }
    }
    // do {
    //   events = await getEvents(appId);
    //   if (
    //     [
    //       ...Object.values(events)
    //         .map(({ events }) => events)
    //         .flat(),
    //     ].length > 1
    //   )
    //     break;
    //   await new Promise((resolve) => setTimeout(resolve, 2000));
    // } while (1);
    // console.log({ claimR });
  });
});
