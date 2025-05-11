import { expect } from "chai";
import { deploy, addressses, sks, transferOwnership } from "../command.js";
const player1 = {
  sender: addressses.player1,
  sk: sks.player1,
};
describe("Ownable Testing", function () {
  this.timeout(60_000);
  let deployOptions = {
    type: "SlotMachine",
    name: "Ownable",
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
  it("Should deploy ownable", async function () {
    console.log("appId", appId);
    expect(appId).to.not.equal(0);
  });
  it("Should transfer ownership", async function () {
    const transferOwnershipR = await transferOwnership({
      appId,
      newOwner: addressses.player1,
    });
    expect(transferOwnershipR).to.be.true;
  });
  it("Should not transfer ownership if not owner", async function () {
    const transferOwnershipR = await transferOwnership({
      appId,
      newOwner: addressses.player1,
      ...player1,
    });
    expect(transferOwnershipR).to.be.false;
  });
  it("Should not transfer ownership after revoked", async function () {
    const transferOwnershipR = await transferOwnership({
      appId,
      newOwner: addressses.player1,
    });
    const transferOwnershipR2 = await transferOwnership({
      appId,
      newOwner: addressses.player1,
    });
    expect(transferOwnershipR).to.be.true;
    expect(transferOwnershipR2).to.be.false;
  });
  it("Should transfer ownership after received", async function () {
    const transferOwnershipR = await transferOwnership({
      appId,
      newOwner: addressses.player1,
    });
    const transferOwnershipR2 = await transferOwnership({
      appId,
      newOwner: addressses.player2,
      ...player1,
    });
    expect(transferOwnershipR).to.be.true;
    expect(transferOwnershipR2).to.be.true;
  });
});
