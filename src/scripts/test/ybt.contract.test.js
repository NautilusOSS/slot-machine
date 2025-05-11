import { expect } from "chai";
import { deploy, addressses, sks, bootstrap } from "../command.js";

describe("Yield Bearing Token Testing", function () {
  this.timeout(60_000);
  let deployOptions = {
    type: "YieldBearingToken",
    name: "TestYieldBearingToken",
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
  it("Should not bootstrap if not owner", async function () {
    const bootstrapSuccess = await bootstrap({
      appId,
      sender: addressses.player1,
      sk: sks.player1,
    });
    expect(bootstrapSuccess).to.be.false;
  });
  it("Should bootstrap", async function () {
    const bootstrapSuccess = await bootstrap({
      appId,
      sender: addressses.deployer,
      sk: sks.deployer,
    });
    expect(bootstrapSuccess).to.be.true;
  });
  it("Should not bootstrap if already bootstrapped", async function () {
    await bootstrap({
      appId,
      sender: addressses.deployer,
      sk: sks.deployer,
    });
    const bootstrapSuccess = await bootstrap({
      appId,
      sender: addressses.deployer,
      sk: sks.deployer,
    });
    expect(bootstrapSuccess).to.be.false;
  });
});
