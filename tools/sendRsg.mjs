import {sendRsgTokens} from "../src/warpy/sendRsgTokens.mjs";

console.log(`Start`);

const external = {
    rsg: {
        id: "mdxBOJ3cy98lqJoPZf7EW0iU4jaqePC3XZRkzoWU1QY",
        recipients: {
            "0x27B5e6004511440e8b38405B8aF03aCe7B0Ae162": 100,
            "0x10f7E1990564Ad12F897C3De93b163B38A37bD52": 100,
            "0xC4694B7CFB2D40A9030Ec45Ee08E91bF6bFE2642": 100,
            "0x13b3fF6f1d996eAf36022eA2a92669e1371E46d7": 100,
            "0xA39d4Ce10e6B586Fe58374C063CA4c777F1a7B7B": 100,
            "0x01D9799410061CCc2daB6b1ED11700C23Ee17b3B": 100,
            "0xe1F7E15F3baFE9e2b999bA0758a5238De25113C0": 100,
            "0x4F60f5148283c0b05cF6D2a16676E3cAbc36e62c": 100,
            "0x8a48A5270D135d9b6284589E7AeFe4745bc7B04C": 100,
            "0x17542889f48d43E97e70Bc439D6A130c7eD5183C": 100,
            "0x4Df8C568A97A731084a214303dA5BD7DBB6aa185": 100,
            "0x342099e60aF415f761899CBA5F323a2D0B1d6357": 100,
            "0x64937ab314bc1999396De341Aa66897C30008852": 100
        },
    },
};



sendRsgTokens(external.rsg, "asd")
    .then(() => console.log(`Uhh, finished!`));