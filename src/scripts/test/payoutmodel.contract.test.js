import { expect } from "chai";
import { deploy } from "../command.js";

describe("Payout Model Testing", function () {
  this.timeout(60_000);
  let deployOptions = {
    type: "SlotMachinePayoutModel",
    name: "TestPayoutModel",
    debug: false,
  };
  let contract;
  let appId;
  before(async function () {});
  beforeEach(async function () {
    const now = Date.now();
    const { appId: id, appClient } = await deploy({
      ...deployOptions,
      name: `${deployOptions.name}-${now}`,
    });
    appId = id;
    contract = appClient;
  });
  afterEach(async function () {});
  it("Should deploy payout model", async function () {
    console.log("appId", appId);
    expect(appId).to.not.equal(0);
  });
  it("Should have payout model initial", async function () {
    const payoutModel = Object.values(
      (await contract.getPayoutModel()).return
    ).flat();
    payoutModel.forEach((value) => {
      expect(value).to.equal(BigInt(0));
    });
  });
  it("Should set payout model", async function () {
    const expectedMultipliers = [100, 50, 20, 10, 5, 2];
    const expectedProbabilities = [
      82_758, 1_655_172, 8_275_862, 16_551_724, 41_379_310, 165_517_241,
    ];
    await contract.setPayoutModel({
      multipliers: expectedMultipliers,
      probabilities: expectedProbabilities,
    });
    const payoutModel = await contract.getPayoutModel();
    console.log("payoutModel", payoutModel.return);
    for (let i = 0; i < 6; i++) {
      expect(payoutModel.return.multipliers[i]).to.equal(
        BigInt(expectedMultipliers[i])
      );
      expect(payoutModel.return.probabilities[i]).to.equal(
        BigInt(expectedProbabilities[i])
      );
    }
  });
  // other tests ...
});
