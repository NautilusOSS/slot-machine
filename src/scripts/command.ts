import { Command } from "commander";
import {
  SlotMachineClient,
  APP_SPEC as SlotMachineSpec,
} from "./clients/SlotMachineClient.js";
import { CONTRACT } from "ulujs";
import algosdk from "algosdk";
import * as dotenv from "dotenv";
import { AppSpec } from "@algorandfoundation/algokit-utils/types/app-spec.js";
dotenv.config({ path: ".env" });

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

console.log(addressses);

// DEVNET
// const ALGO_SERVER = "http://localhost";
// const ALGO_INDEXER_SERVER = "http://localhost";
//const ALGO_PORT = 4001;
//const ALGO_INDEXER_PORT = 8980;
const ALGO_PORT = 443;
const ALGO_INDEXER_PORT = 443;

// TESTNET
// const ALGO_SERVER = "https://testnet-api.voi.nodely.dev";
// const ALGO_INDEXER_SERVER = "https://testnet-idx.voi.nodely.dev";

// MAINNET
const ALGO_SERVER = "https://mainnet-api.voi.nodely.dev";
const ALGO_INDEXER_SERVER = "https://mainnet-idx.voi.nodely.dev";

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

type DeployType = "SlotMachine";

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
  const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(SlotMachineSpec), acc);
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

program
  .command("post-update")
  .requiredOption("-a, --appId <number>", "Specify app id")
  .requiredOption("-s, --sender <string>", "Specify sender")
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
  futureRoundOffset?: number;
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
  ci.setPaymentAmount(options.amount + 1e5 + 37700);
  const spinR = await ci.spin(options.amount, options?.index || 0, options?.futureRoundOffset || 0);
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
  ci.setFee(3000);
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
