import { Command } from "commander";
import {
  SlotMachineClient,
  APP_SPEC as SlotMachineSpec,
} from "./clients/SlotMachineClient.js";
import {
  SlotMachinePayoutModelClient,
  APP_SPEC as SlotMachinePayoutModelSpec,
} from "./clients/SlotMachinePayoutModelClient.js";
import {
  BeaconClient,
  APP_SPEC as BeaconSpec,
} from "./clients/BeaconClient.js";
import {
  YieldBearingTokenClient,
  APP_SPEC as YieldBearingTokenSpec,
} from "./clients/YieldBearingTokenClient.js";
import { CONTRACT } from "ulujs";
import algosdk from "algosdk";
import * as dotenv from "dotenv";
import { AppSpec } from "@algorandfoundation/algokit-utils/types/app-spec.js";
dotenv.config({ path: ".env" });

const BOX_COST_BET = 37700;

export const program = new Command();

const { MN, MN2, MN3 } = process.env;

export const acc = algosdk.mnemonicToSecretKey(MN || "");
export const acc2 = algosdk.mnemonicToSecretKey(MN2 || "");
export const acc3 = algosdk.mnemonicToSecretKey(MN3 || "");

export const { addr, sk } = acc;
export const { addr: addr2, sk: sk2 } = acc2;
export const { addr: addr3, sk: sk3 } = acc3;

export const addressses = {
  deployer: addr,
  player1: addr2,
  player2: addr3,
};

export const sks = {
  deployer: sk,
  player1: sk2,
  player2: sk3,
};

// DEVNET
const ALGO_SERVER = "http://localhost";
const ALGO_INDEXER_SERVER = "http://localhost";
const ALGO_PORT = 4001;
const ALGO_INDEXER_PORT = 8980;

// TESTNET
// const ALGO_SERVER = "https://testnet-api.voi.nodely.dev";
// const ALGO_INDEXER_SERVER = "https://testnet-idx.voi.nodely.dev";

// MAINNET
// const ALGO_SERVER = "https://mainnet-api.voi.nodely.dev";
// const ALGO_INDEXER_SERVER = "https://mainnet-idx.voi.nodely.dev";
// const ALGO_PORT = 443;
// const ALGO_INDEXER_PORT = 443;

const algodServerURL = process.env.ALGOD_SERVER || ALGO_SERVER;
const algodServerPort = process.env.ALGOD_PORT || ALGO_PORT;
export const algodClient = new algosdk.Algodv2(
  process.env.ALGOD_TOKEN ||
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  algodServerURL,
  algodServerPort
);

const indexerServerURL = process.env.INDEXER_SERVER || ALGO_INDEXER_SERVER;
const indexerServerPort = process.env.INDEXER_PORT || ALGO_INDEXER_PORT;
export const indexerClient = new algosdk.Indexer(
  process.env.INDEXER_TOKEN || "",
  indexerServerURL,
  indexerServerPort
);

console.log(addressses, algodServerURL);

const signSendAndConfirm = async (txns: string[], sk: any) => {
  const stxns = txns
    .map((t) => new Uint8Array(Buffer.from(t, "base64")))
    .map(algosdk.decodeUnsignedTransaction)
    .map((t: any) => algosdk.signTransaction(t, sk));
  await algodClient.sendRawTransaction(stxns.map((txn: any) => txn.blob)).do();
  return await Promise.all(
    stxns.map((res: any) =>
      algosdk.waitForConfirmation(algodClient, res.txID, 4)
    )
  );
};

export const invalidSpin = new Array(56).fill(0);

export const decodeBetPlaced = (event: any[]) => {
  return {
    txid: event[0],
    round: Number(event[1]),
    timestamp: Number(event[2]),
    who: event[3],
    amount: Number(event[4]),
    confirmedRound: Number(event[5]),
    index: Number(event[6]),
    claimRound: Number(event[7]),
  };
};

const makeABI = (spec: AppSpec) => {
  return {
    name: spec.contract.name,
    desc: spec.contract.desc,
    methods: spec.contract.methods,
    events: [
      {
        name: "BetPlaced",
        args: [
          {
            type: "address",
          },
          {
            type: "uint64",
          },
          {
            type: "uint64",
          },
          {
            type: "uint64",
          },
          {
            type: "uint64",
          },
        ],
      },
      {
        name: "BetClaimed",
        args: [
          {
            type: "address",
          },
          {
            type: "uint64",
          },
          {
            type: "uint64",
          },
          {
            type: "uint64",
          },
          {
            type: "uint64",
          },
          {
            type: "uint64",
          },
        ],
      },
    ],
  };
};

export const getEvents = async (appId: number) => {
  const ci = new CONTRACT(
    appId,
    algodClient,
    indexerClient,
    makeABI(SlotMachineSpec),
    {
      addr: addressses.deployer,
      sk: sks.deployer,
    }
  );
  const events = await ci.getEvents({});
  return events;
};

type DeployType =
  | "SlotMachine"
  | "SlotMachinePayoutModel"
  | "Beacon"
  | "YieldBearingToken";

interface DeployOptions {
  type: DeployType;
  name: string;
  debug?: boolean;
}

export const deploy: any = async (options: DeployOptions) => {
  if (options.debug) {
    console.log(options);
  }
  const deployer = {
    addr: addr,
    sk: sk,
  };
  let Client;
  switch (options.type) {
    case "SlotMachine": {
      Client = SlotMachineClient;
      break;
    }
    case "SlotMachinePayoutModel": {
      Client = SlotMachinePayoutModelClient;
      break;
    }
    case "Beacon": {
      Client = BeaconClient;
      break;
    }
    case "YieldBearingToken": {
      Client = YieldBearingTokenClient;
      break;
    }
  }
  const clientParams: any = {
    resolveBy: "creatorAndName",
    findExistingUsing: indexerClient,
    creatorAddress: deployer.addr,
    name: options.name || "",
    sender: deployer,
  };
  const appClient = Client ? new Client(clientParams, algodClient) : null;
  if (appClient) {
    const app = await appClient.deploy({
      deployTimeParams: {},
      onUpdate: "update",
      onSchemaBreak: "fail",
    });
    return { appId: app.appId, appClient: appClient };
  }
};
program
  .command("deploy")
  .requiredOption("-t, --type <string>", "Specify factory type")
  .requiredOption("-n, --name <string>", "Specify contract name")
  .option("--debug", "Debug the deployment", false)
  .description("Deploy a specific contract type")
  .action(async (options: DeployOptions) => {
    const apid = await deploy(options);
    if (!apid) {
      console.log("Failed to deploy contract");
      return;
    }
    console.log(apid);
  });

interface PostUpdateOptions {
  appId: number;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const postUpdate: any = async (options: PostUpdateOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(SlotMachineSpec),
    acc
  );
  const postUpdateR = await ci.post_upgrade();
  if (options.debug) {
    console.log(postUpdateR);
  }
  if (postUpdateR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(postUpdateR.txns, sk);
    }
    return true;
  }
  return false;
};

// owneable

interface TransferOwnershipOptions {
  appId: number;
  sender: string;
  newOwner: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const transferOwnership: any = async (
  options: TransferOwnershipOptions
) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(SlotMachineSpec),
    acc
  );
  const transferOwnershipR = await ci.transfer(options.newOwner);
  if (options.debug) {
    console.log(transferOwnershipR);
  }
  if (transferOwnershipR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(transferOwnershipR.txns, sk);
    }
    return true;
  }
  return false;
};

program
  .command("transfer-ownership")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .requiredOption("-n, --newOwner <string>", "Specify new owner")
  .option("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the transfer-ownership", false)
  .option("--simulate", "Simulate the transfer-ownership", false)
  .action(async (options: TransferOwnershipOptions) => {
    const success = await transferOwnership({
      ...options,
      appId: Number(options.appId),
    });
    if (!success) {
      console.log("Failed to transfer ownership");
    }
  });

// slot machine

program
  .command("post-update")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .option("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the post-update", false)
  .action(async (options: PostUpdateOptions) => {
    const success = await postUpdate({
      ...options,
      appId: Number(options.appId),
    });
    if (!success) {
      console.log("Failed to post-update");
    }
  });

interface DepositOptions {
  appId: number;
  amount: number;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const deposit: any = async (options: DepositOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(SlotMachineSpec),
    acc
  );
  ci.setPaymentAmount(options.amount);
  const depositR = await ci.deposit();
  if (options.debug) {
    console.log(depositR);
  }
  if (depositR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(depositR.txns, sk);
    }
    return true;
  }
  return false;
};

program
  .command("deposit")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .requiredOption("-m, --amount <number>", "Specify amount")
  .requiredOption("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the deposit", false)
  .action(async (options: DepositOptions) => {
    const success = await deposit({
      ...options,
      appId: Number(options.appId),
      amount: Number(options.amount),
    });
    if (!success) {
      console.log("Failed to deposit");
    }
  });

interface WithdrawOptions {
  appId: number;
  amount: number;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const withdraw: any = async (options: WithdrawOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(SlotMachineSpec),
    acc
  );
  ci.setFee(2000);
  const withdrawR = await ci.withdraw(options.amount);
  if (options.debug) {
    console.log(withdrawR);
  }
  if (withdrawR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(withdrawR.txns, sk);
    }
    return true;
  }
  return false;
};

program
  .command("withdraw")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .requiredOption("-m, --amount <number>", "Specify amount")
  .requiredOption("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the withdraw", false)
  .action(async (options: WithdrawOptions) => {
    const success = await withdraw({
      ...options,
      appId: Number(options.appId),
      amount: Number(options.amount),
    });
    if (!success) {
      console.log("Failed to withdraw");
    }
  });

interface SpinOptions {
  appId: number;
  amount: number;
  index?: number;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const spin: any = async (options: SpinOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(SlotMachineSpec),
    acc
  );
  ci.setEnableParamsLastRoundMod(true);
  ci.setEnableRawBytes(true);
  ci.setPaymentAmount(options.amount + BOX_COST_BET);
  const spinR = await ci.spin(options.amount, options?.index || 0);
  if (options.debug) {
    console.log(spinR);
  }
  if (spinR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(spinR.txns, sk);
    }
    return spinR.returnValue;
  }
  return invalidSpin;
};

interface MaxBetOptions {
  appId: number;
  sender: string;
  sk: any;
  debug?: boolean;
}

export const getMaxBet: any = async (options: MaxBetOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(SlotMachineSpec),
    acc
  );
  const maxBetR = await ci.get_max_bet();
  if (options.debug) {
    console.log(maxBetR);
  }
  return Number(maxBetR.returnValue);
};

interface ClaimOptions {
  appId: number;
  index: number;
  betKey: Uint8Array;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const claim: any = async (options: ClaimOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(SlotMachineSpec),
    acc
  );
  ci.setEnableParamsLastRoundMod(true);
  ci.setFee(4000);
  const claimR = await ci.claim(options.betKey);
  if (options.debug) {
    console.log(claimR);
  }
  if (claimR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(claimR.txns, sk);
    }
  }
  return claimR;
};

interface KillOptions {
  appId: number;
  sender: string;
  sk: any;
  delete?: boolean;
  debug?: boolean;
  simulate?: boolean;
}

export const kill: any = async (options: KillOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(SlotMachineSpec),
    acc
  );
  if (options.delete) {
    ci.setOnComplete(5); // deleteApplicationOC
  }
  ci.setFee(3000);
  const killR = await ci.kill();
  if (options.debug) {
    console.log(killR);
  }
  if (killR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(killR.txns, sk);
    }
    return true;
  }
  return false;
};

program
  .command("kill")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .option("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the kill", false)
  .option("--simulate", "Simulate the kill", false)
  .option("--delete", "Delete the app", false)
  .action(async (options: KillOptions) => {
    const success = await kill({
      ...options,
      appId: Number(options.appId),
    });
    if (!success) {
      console.log("Failed to kill");
    }
  });

interface SlotMachineSetPayoutModelOptions {
  appId: number;
  payoutModelAppId: number;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const slotMachineSetPayoutModel: any = async (
  options: SlotMachineSetPayoutModelOptions
) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(SlotMachineSpec),
    acc
  );
  const setPayoutModelR = await ci.set_payout_model(options.payoutModelAppId);
  if (options.debug) {
    console.log(setPayoutModelR);
  }
  if (setPayoutModelR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(setPayoutModelR.txns, sk);
    }
    return true;
  }
  return false;
};

program
  .command("set-payout-model")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .requiredOption(
    "-p, --payoutModelAppId <number>",
    "Specify payout model app id"
  )
  .option("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the set-payout-model", false)
  .option("--simulate", "Simulate the set-payout-model", false)
  .action(async (options: SlotMachineSetPayoutModelOptions) => {
    const success = await slotMachineSetPayoutModel({
      ...options,
      appId: Number(options.appId),
      payoutModelAppId: Number(options.payoutModelAppId),
    });
    if (!success) {
      console.log("Failed to set payout model");
    }
  });

interface TouchOptions {
  appId: number;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const touch: any = async (options: TouchOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(BeaconSpec),
    acc
  );
  const touchR = await ci.touch();
  if (options.debug) {
    console.log(touchR);
  }
  if (touchR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(touchR.txns, sk);
    }
    return true;
  }
  return false;
};

interface SetPayoutModelOptions {
  appId: number;
  multipliers: any;
  probabilities: any;
  sender?: string;
  sk?: any;
  debug?: boolean;
  simulate?: boolean;
}

export const setPayoutModel: any = async (options: SetPayoutModelOptions) => {
  const client = new SlotMachinePayoutModelClient(
    {
      id: options.appId,
      resolveBy: "id",
      sender: {
        addr: options.sender || addressses.deployer,
        sk: options.sk || sks.deployer,
      },
    },
    algodClient
  );
  await client.setPayoutModel({
    multipliers: options.multipliers.map(BigInt),
    probabilities: options.probabilities.map(BigInt),
  });
};

interface GetOwnerOptions {
  appId: number;
  sender: string;
  sk: any;
  debug?: boolean;
}

export const getOwner: any = async (options: GetOwnerOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(SlotMachineSpec),
    acc
  );
  const ownerR = await ci.get_owner();
  return ownerR.returnValue;
};

// arc200

interface Arc200BalanceOfOptions {
  appId: number;
  address: string;
  sender: string;
  sk: any;
  debug?: boolean;
}

export const arc200BalanceOf: any = async (options: Arc200BalanceOfOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(YieldBearingTokenSpec),
    acc
  );
  const balanceOfR = await ci.arc200_balanceOf(options.address);
  return balanceOfR.returnValue;
};

interface Arc200ApproveOptions {
  appId: number;
  spender: string;
  amount: number;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const arc200Approve: any = async (options: Arc200ApproveOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(YieldBearingTokenSpec),
    acc
  );
  const approveR = await ci.arc200_approve(options.spender, options.amount);
  if (options.debug) {
    console.log(approveR);
  }
  if (approveR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(approveR.txns, sk);
    }
    return true;
  }
  return false;
};

// ybt

interface BootstrapOptions {
  appId: number;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const bootstrap: any = async (options: BootstrapOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(YieldBearingTokenSpec),
    acc
  );
  ci.setPaymentAmount(1e6);
  const bootstrapR = await ci.bootstrap();
  if (options.debug) {
    console.log(bootstrapR);
  }
  if (bootstrapR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(bootstrapR.txns, sk);
    }
    return true;
  }
  return false;
};

program
  .command("bootstrap")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .option("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the bootstrap", false)
  .option("--simulate", "Simulate the bootstrap", false)
  .action(async (options: BootstrapOptions) => {
    const success = await bootstrap({
      ...options,
      appId: Number(options.appId),
    });
    if (!success) {
      console.log("Failed to bootstrap");
    }
  });

interface RevokeYieldBearingSourceOptions {
  appId: number;
  newOwner: string;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const revokeYieldBearingSource: any = async (
  options: RevokeYieldBearingSourceOptions
) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(YieldBearingTokenSpec),
    acc
  );
  const revokeYieldBearingSourceR = await ci.revoke_yield_bearing_source(
    options.newOwner
  );
  if (options.debug) {
    console.log(revokeYieldBearingSourceR);
  }
  if (revokeYieldBearingSourceR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(revokeYieldBearingSourceR.txns, sk);
    }
    return true;
  }
  return false;
};

interface SetYieldBearingSourceOptions {
  appId: number;
  source: number;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const setYieldBearingSource: any = async (
  options: SetYieldBearingSourceOptions
) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(YieldBearingTokenSpec),
    acc
  );
  ci.setFee(2000);
  const setYieldBearingSourceR = await ci.set_yield_bearing_source(
    options.source
  );
  if (options.debug) {
    console.log(setYieldBearingSourceR);
  }
  if (setYieldBearingSourceR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(setYieldBearingSourceR.txns, sk);
    }
    return true;
  }
  return false;
};

program
  .command("set-yield-bearing-source")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .requiredOption("-s, --source <number>", "Specify source")
  .option("-t, --sender <string>", "Specify sender")
  .option("--debug", "Debug the set-yield-bearing-source", false)
  .option("--simulate", "Simulate the set-yield-bearing-source", false)
  .action(async (options: SetYieldBearingSourceOptions) => {
    const success = await setYieldBearingSource({
      ...options,
      appId: Number(options.appId),
      source: Number(options.source),
    });
    if (!success) {
      console.log("Failed to set yield bearing source");
    }
  });

interface ybtDepositOptions {
  appId: number;
  amount: number;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const ybtDeposit: any = async (options: ybtDepositOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(YieldBearingTokenSpec),
    acc
  );
  ci.setFee(4000);
  ci.setPaymentAmount(options.amount);
  const depositR = await ci.deposit();
  if (options.debug) {
    console.log(depositR);
  }
  if (depositR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(depositR.txns, sk);
    }
    return depositR.returnValue;
  }
  return BigInt(0);
};

program
  .command("ybt-deposit")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .requiredOption("-b, --amount <number>", "Specify amount")
  .option("-s, --sender <string>", "Specify sender")
  .option("--debug", "Debug the ybt-deposit", false)
  .option("--simulate", "Simulate the ybt-deposit", false)
  .action(async (options: ybtDepositOptions) => {
    const success = await ybtDeposit({
      ...options,
      appId: Number(options.appId),
      amount: Number(options.amount),
    });
    if (!success) {
      console.log("Failed to deposit");
    }
  });

interface ybtWithdrawOptions {
  appId: number;
  amount: number;
  sender: string;
  sk: any;
  debug?: boolean;
  simulate?: boolean;
}

export const ybtWithdraw: any = async (options: ybtWithdrawOptions) => {
  const addr = options.sender || addressses.deployer;
  const sk = options.sk || sks.deployer;
  const acc = { addr, sk };
  const ci = new CONTRACT(
    options.appId,
    algodClient,
    indexerClient,
    makeABI(YieldBearingTokenSpec),
    acc
  );
  ci.setFee(5000);
  const withdrawR = await ci.withdraw(options.amount);
  if (options.debug) {
    console.log(withdrawR);
  }
  if (withdrawR.success) {
    if (!options.simulate) {
      await signSendAndConfirm(withdrawR.txns, sk);
    }
    return withdrawR.returnValue;
  }
  return BigInt(0);
};
