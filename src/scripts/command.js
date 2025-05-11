import { Command } from "commander";
import { SlotMachineClient, APP_SPEC as SlotMachineSpec, } from "./clients/SlotMachineClient.js";
import { SlotMachinePayoutModelClient, } from "./clients/SlotMachinePayoutModelClient.js";
import { BeaconClient, APP_SPEC as BeaconSpec, } from "./clients/BeaconClient.js";
import { YieldBearingTokenClient, APP_SPEC as YieldBearingTokenSpec, } from "./clients/YieldBearingTokenClient.js";
import { CONTRACT } from "ulujs";
import algosdk from "algosdk";
import * as dotenv from "dotenv";
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
export const algodClient = new algosdk.Algodv2(process.env.ALGOD_TOKEN ||
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", algodServerURL, algodServerPort);
const indexerServerURL = process.env.INDEXER_SERVER || ALGO_INDEXER_SERVER;
const indexerServerPort = process.env.INDEXER_PORT || ALGO_INDEXER_PORT;
export const indexerClient = new algosdk.Indexer(process.env.INDEXER_TOKEN || "", indexerServerURL, indexerServerPort);
console.log(addressses, algodServerURL);
const signSendAndConfirm = async (txns, sk) => {
    const stxns = txns
        .map((t) => new Uint8Array(Buffer.from(t, "base64")))
        .map(algosdk.decodeUnsignedTransaction)
        .map((t) => algosdk.signTransaction(t, sk));
    await algodClient.sendRawTransaction(stxns.map((txn) => txn.blob)).do();
    return await Promise.all(stxns.map((res) => algosdk.waitForConfirmation(algodClient, res.txID, 4)));
};
export const invalidSpin = new Array(56).fill(0);
export const decodeBetPlaced = (event) => {
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
const makeABI = (spec) => {
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
export const getEvents = async (appId) => {
    const ci = new CONTRACT(appId, algodClient, indexerClient, makeABI(SlotMachineSpec), {
        addr: addressses.deployer,
        sk: sks.deployer,
    });
    const events = await ci.getEvents({});
    return events;
};
export const deploy = async (options) => {
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
    const clientParams = {
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
    .action(async (options) => {
    const apid = await deploy(options);
    if (!apid) {
        console.log("Failed to deploy contract");
        return;
    }
    console.log(apid);
});
export const postUpdate = async (options) => {
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
export const transferOwnership = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(SlotMachineSpec), acc);
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
// slot machine
program
    .command("post-update")
    .requiredOption("-a, --appId <number>", "Specify app id")
    .option("-s, --sender <string>", "Specify sender")
    .option("--debug", "Debug the post-update", false)
    .action(async (options) => {
    const success = await postUpdate({
        ...options,
        appId: Number(options.appId),
    });
    if (!success) {
        console.log("Failed to post-update");
    }
});
export const deposit = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(SlotMachineSpec), acc);
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
    .action(async (options) => {
    const success = await deposit({
        ...options,
        appId: Number(options.appId),
        amount: Number(options.amount),
    });
    if (!success) {
        console.log("Failed to deposit");
    }
});
export const withdraw = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(SlotMachineSpec), acc);
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
    .action(async (options) => {
    const success = await withdraw({
        ...options,
        appId: Number(options.appId),
        amount: Number(options.amount),
    });
    if (!success) {
        console.log("Failed to withdraw");
    }
});
export const spin = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(SlotMachineSpec), acc);
    ci.setEnableParamsLastRoundMod(true);
    ci.setEnableRawBytes(true);
    ci.setPaymentAmount(options.amount + 1e5 + 37700);
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
export const getMaxBet = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(SlotMachineSpec), acc);
    const maxBetR = await ci.get_max_bet();
    if (options.debug) {
        console.log(maxBetR);
    }
    return Number(maxBetR.returnValue);
};
export const claim = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(SlotMachineSpec), acc);
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
export const kill = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(SlotMachineSpec), acc);
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
    .action(async (options) => {
    const success = await kill({
        ...options,
        appId: Number(options.appId),
    });
    if (!success) {
        console.log("Failed to kill");
    }
});
export const slotMachineSetPayoutModel = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(SlotMachineSpec), acc);
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
    .requiredOption("-p, --payoutModelAppId <number>", "Specify payout model app id")
    .requiredOption("-s, --sender <string>", "Specify sender")
    .option("--debug", "Debug the set-payout-model", false)
    .option("--simulate", "Simulate the set-payout-model", false)
    .action(async (options) => {
    const success = await slotMachineSetPayoutModel({
        ...options,
        appId: Number(options.appId),
        payoutModelAppId: Number(options.payoutModelAppId),
    });
    if (!success) {
        console.log("Failed to set payout model");
    }
});
export const touch = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(BeaconSpec), acc);
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
export const setPayoutModel = async (options) => {
    const client = new SlotMachinePayoutModelClient({
        id: options.appId,
        resolveBy: "id",
        sender: {
            addr: options.sender || addressses.deployer,
            sk: options.sk || sks.deployer,
        },
    }, algodClient);
    await client.setPayoutModel({
        multipliers: options.multipliers.map(BigInt),
        probabilities: options.probabilities.map(BigInt),
    });
};
export const getOwner = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(SlotMachineSpec), acc);
    const ownerR = await ci.get_owner();
    return ownerR.returnValue;
};
export const arc200BalanceOf = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(YieldBearingTokenSpec), acc);
    const balanceOfR = await ci.arc200_balanceOf(options.address);
    return balanceOfR.returnValue;
};
export const arc200Approve = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(YieldBearingTokenSpec), acc);
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
export const bootstrap = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(YieldBearingTokenSpec), acc);
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
export const revokeYieldBearingSource = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(YieldBearingTokenSpec), acc);
    const revokeYieldBearingSourceR = await ci.revoke_yield_bearing_source(options.newOwner);
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
export const setYieldBearingSource = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(YieldBearingTokenSpec), acc);
    ci.setFee(2000);
    const setYieldBearingSourceR = await ci.set_yield_bearing_source(options.source);
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
export const ybtDeposit = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(YieldBearingTokenSpec), acc);
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
export const ybtWithdraw = async (options) => {
    const addr = options.sender || addressses.deployer;
    const sk = options.sk || sks.deployer;
    const acc = { addr, sk };
    const ci = new CONTRACT(options.appId, algodClient, indexerClient, makeABI(YieldBearingTokenSpec), acc);
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
