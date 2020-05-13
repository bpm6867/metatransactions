import "mocha";
import * as chai from "chai";
import { solidity, loadFixture } from "ethereum-waffle";

import { fnIt } from "@pisa-research/test-utils";
import {
  ReplayProtectionWrapperFactory,
  ReplayProtectionWrapper,
  ChainID,
} from "../../src";
import { Provider } from "ethers/providers";
import { Wallet } from "ethers/wallet";
import { defaultAbiCoder, keccak256, arrayify, BigNumber } from "ethers/utils";
import { AddressZero } from "ethers/constants";
import { Contract } from "ethers";

const expect = chai.expect;
chai.use(solidity);

let dummyAccount: ReplayProtectionWrapper;
type replayProtection = typeof dummyAccount.functions;

function flipBit(bits: BigNumber, bitToFlip: BigNumber): BigNumber {
  return new BigNumber(bits).add(new BigNumber(2).pow(bitToFlip));
}

async function signCall(
  replayProtection: Contract,
  replayProtectionAuthority: string,
  signer: Wallet,
  nonce1: number,
  nonce2: number
) {
  const callData = "0x";
  const encodedReplayProtection = defaultAbiCoder.encode(
    ["uint", "uint"],
    [nonce1, nonce2]
  );

  const encodedMessage = defaultAbiCoder.encode(
    ["bytes", "bytes", "address", "address", "uint"],
    [
      callData,
      encodedReplayProtection,
      replayProtectionAuthority,
      replayProtection.address,
      ChainID.MAINNET,
    ]
  );
  const signedCall = await signer.signMessage(
    arrayify(keccak256(encodedMessage))
  );

  return {
    callData,
    encodedReplayProtection,
    signedCall,
  };
}

async function createReplayProtection(
  provider: Provider,
  [admin, owner, sender]: Wallet[]
) {
  const replayProtection = await new ReplayProtectionWrapperFactory(
    admin
  ).deploy();

  return {
    provider,
    replayProtection,
    admin,
    owner,
    sender,
  };
}

describe("ReplayProtection", () => {
  fnIt<replayProtection>(
    (a) => a.noncePublic,
    "increment a single queue once to test NONCE",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const nonceReplayProtection = defaultAbiCoder.encode(
        ["uint", "uint"],
        [0, 0]
      );

      await replayProtection.noncePublic(admin.address, nonceReplayProtection);

      const index = keccak256(
        defaultAbiCoder.encode(
          ["address", "uint", "address"],
          [admin.address, 0, AddressZero]
        )
      );
      const storedNonce = await replayProtection.nonceStore(index);

      expect(storedNonce.toNumber()).to.eq(1);
    }
  );

  fnIt<replayProtection>(
    (a) => a.noncePublic,
    "increment a single queue multiple times to test NONCE",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const queue = 0;
      for (let i = 0; i < 50; i++) {
        const nonceReplayProtection = defaultAbiCoder.encode(
          ["uint", "uint"],
          [queue, i]
        );

        await replayProtection.noncePublic(
          admin.address,
          nonceReplayProtection
        );

        const index = keccak256(
          defaultAbiCoder.encode(
            ["address", "uint", "address"],
            [admin.address, queue, AddressZero]
          )
        );
        const storedNonce = await replayProtection.nonceStore(index);

        expect(storedNonce.toNumber()).to.eq(i + 1);
      }
    }
  );

  fnIt<replayProtection>(
    (a) => a.noncePublic,
    "only increment 50 queues once to test MULTINONCE",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const queueNonce = 0;
      for (let queue = 0; queue < 50; queue++) {
        const nonceReplayProtection = defaultAbiCoder.encode(
          ["uint", "uint"],
          [queue, queueNonce]
        );

        await replayProtection.noncePublic(
          admin.address,
          nonceReplayProtection
        );

        const index = keccak256(
          defaultAbiCoder.encode(
            ["address", "uint", "address"],
            [admin.address, queue, AddressZero]
          )
        );
        const storedNonce = await replayProtection.nonceStore(index);

        expect(storedNonce.toNumber()).to.eq(1);
      }
    }
  );

  fnIt<replayProtection>(
    (a) => a.noncePublic,
    "increment 20 queues multiple times to test MULTINONCE",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      for (let queue = 0; queue < 20; queue++) {
        for (let queueNonce = 0; queueNonce < 20; queueNonce++) {
          const nonceReplayProtection = defaultAbiCoder.encode(
            ["uint", "uint"],
            [queue, queueNonce]
          );

          await replayProtection.noncePublic(
            admin.address,
            nonceReplayProtection
          );

          const index = keccak256(
            defaultAbiCoder.encode(
              ["address", "uint", "address"],
              [admin.address, queue, AddressZero]
            )
          );
          const storedNonce = await replayProtection.nonceStore(index);

          expect(storedNonce.toNumber()).to.eq(queueNonce + 1);
        }
      }
    }
  ).timeout("50000");

  fnIt<replayProtection>(
    (a) => a.verifyPublic,
    "access nonce() via verify (e.g. the replay protection authority)",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const { callData, encodedReplayProtection, signedCall } = await signCall(
        replayProtection,
        AddressZero,
        admin,
        0,
        0
      );

      const index = keccak256(
        defaultAbiCoder.encode(
          ["address", "uint", "address"],
          [admin.address, 0, AddressZero]
        )
      );

      await replayProtection.verifyPublic(
        callData,
        encodedReplayProtection,
        AddressZero,
        admin.address,
        signedCall
      );

      const nonce = await replayProtection.nonceStore(index);

      expect(nonce).to.eq(1);
    }
  ).timeout("50000");

  fnIt<replayProtection>(
    (a) => a.verifyPublic,
    "for nonce() the same replay protection is used twice and should fail",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const { callData, encodedReplayProtection, signedCall } = await signCall(
        replayProtection,
        AddressZero,
        admin,
        0,
        0
      );

      const index = keccak256(
        defaultAbiCoder.encode(
          ["address", "uint", "address"],
          [admin.address, 0, "0x0000000000000000000000000000000000000000"]
        )
      );

      await replayProtection.verifyPublic(
        callData,
        encodedReplayProtection,
        AddressZero,
        admin.address,
        signedCall
      );

      const nonce = await replayProtection.nonceStore(index);

      expect(nonce).to.eq(1);

      const tx = replayProtection.verifyPublic(
        callData,
        encodedReplayProtection,
        AddressZero,
        admin.address,
        signedCall
      );

      await expect(tx).to.be.revertedWith(
        "Multinonce replay protection failed"
      );
    }
  ).timeout("50000");

  fnIt<replayProtection>(
    (a) => a.verifyPublic,
    "for nonce(), the nonce is used (nonce==1) is not yet valid (out of order) and should fail",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const { callData, encodedReplayProtection, signedCall } = await signCall(
        replayProtection,
        AddressZero,
        admin,
        0,
        1
      );

      const tx = replayProtection.verifyPublic(
        callData,
        encodedReplayProtection,
        AddressZero,
        admin.address,
        signedCall
      );

      await expect(tx).to.be.revertedWith(
        "Multinonce replay protection failed"
      );
    }
  ).timeout("50000");

  fnIt<replayProtection>(
    (a) => a.verifyPublic,
    "access nonce() via verify fails as the nonce queue (nonce1) is the wrong replay protection authority.",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const { callData, encodedReplayProtection, signedCall } = await signCall(
        replayProtection,
        "0x0000000000000000000000000000000000000000",
        admin,
        0,
        1
      );

      const tx = replayProtection.verifyPublic(
        callData,
        encodedReplayProtection,
        "0x0000000000000000000000000000000000000001",
        admin.address,
        signedCall
      );

      // User signs AddressZero, but the contract computes signature for AddressOne
      await expect(tx).to.be.revertedWith("Not expected signer");
    }
  ).timeout("50000");

  fnIt<replayProtection>(
    (a) => a.bitflipPublic,
    "flip a single bit to test BITFLIP",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const bitmapIndex = 6175;

      const flippedBit = flipBit(new BigNumber("0"), new BigNumber("0"));
      const nonceReplayProtection = defaultAbiCoder.encode(
        ["uint", "uint"],
        [bitmapIndex, flippedBit]
      );

      await replayProtection.bitflipPublic(
        admin.address,
        nonceReplayProtection
      );

      const index = keccak256(
        defaultAbiCoder.encode(
          ["address", "uint", "address"],
          [
            admin.address,
            bitmapIndex,
            "0x0000000000000000000000000000000000000001",
          ]
        )
      );

      const storedNonce = await replayProtection.nonceStore(index);
      expect(storedNonce.toNumber()).to.eq(flippedBit);
    }
  );

  fnIt<replayProtection>(
    (a) => a.bitflipPublic,
    "try to flip 0 bits and it should fail",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const bitmapIndex = 6175;

      const nonceReplayProtection = defaultAbiCoder.encode(
        ["uint", "uint"],
        [bitmapIndex, new BigNumber("0")]
      );

      await expect(
        replayProtection.bitflipPublic(admin.address, nonceReplayProtection)
      ).to.be.revertedWith("It must flip at least one bit!");
    }
  );

  fnIt<replayProtection>(
    (a) => a.bitflipPublic,
    "flipping the same bit twice for BITFLIP should not update nonce in the the noncestore",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const bitmapIndex = 6175;

      const flippedBit = flipBit(new BigNumber("0"), new BigNumber("0"));
      const nonceReplayProtection = defaultAbiCoder.encode(
        ["uint", "uint"],
        [bitmapIndex, flippedBit]
      );

      await replayProtection.bitflipPublic(
        admin.address,
        nonceReplayProtection
      );

      const index = keccak256(
        defaultAbiCoder.encode(
          ["address", "uint", "address"],
          [
            admin.address,
            bitmapIndex,
            "0x0000000000000000000000000000000000000001",
          ]
        )
      );

      let storedNonce = await replayProtection.nonceStore(index);
      expect(storedNonce.toNumber()).to.eq(flippedBit);

      await replayProtection.bitflipPublic(
        admin.address,
        nonceReplayProtection
      );

      storedNonce = await replayProtection.nonceStore(index);
      expect(storedNonce.toNumber()).to.eq(flippedBit);
    }
  );

  fnIt<replayProtection>(
    (a) => a.bitflipPublic,
    "flip several bits and all bits should be recorded in the stored bitmap",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const bitmapIndex = 6175;

      // Flip the 1st bit
      const flipBit1 = flipBit(new BigNumber("0"), new BigNumber("0"));
      await replayProtection.bitflipPublic(
        admin.address,
        defaultAbiCoder.encode(["uint", "uint"], [bitmapIndex, flipBit1])
      );

      const index = keccak256(
        defaultAbiCoder.encode(
          ["address", "uint", "address"],
          [
            admin.address,
            bitmapIndex,
            "0x0000000000000000000000000000000000000001",
          ]
        )
      );

      let storedNonce = await replayProtection.nonceStore(index);
      expect(storedNonce.toNumber()).to.eq(flipBit1);

      // Flip the 10th bit
      const flipBit10 = flipBit(new BigNumber("0"), new BigNumber("10"));
      await replayProtection.bitflipPublic(
        admin.address,
        defaultAbiCoder.encode(["uint", "uint"], [bitmapIndex, flipBit10])
      );

      storedNonce = await replayProtection.nonceStore(index);
      let totalFlipped = flipBit(flipBit1, new BigNumber("10"));
      expect(storedNonce).to.eq(totalFlipped);

      // Flip the 200th bit
      const flipBit200 = flipBit(new BigNumber("0"), new BigNumber("200"));
      await replayProtection.bitflipPublic(
        admin.address,
        defaultAbiCoder.encode(["uint", "uint"], [bitmapIndex, flipBit200])
      );

      storedNonce = await replayProtection.nonceStore(index);
      totalFlipped = flipBit(totalFlipped, new BigNumber("200"));
      expect(storedNonce).to.eq(totalFlipped);
    }
  );

  fnIt<replayProtection>(
    (a) => a.verifyPublic,
    "access bitflip() via verify (e.g. the replay protection authority)",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const bitmapIndex = 123;
      const bitToFlip = flipBit(new BigNumber("0"), new BigNumber("0"));

      const { callData, encodedReplayProtection, signedCall } = await signCall(
        replayProtection,
        "0x0000000000000000000000000000000000000001",
        admin,
        bitmapIndex,
        bitToFlip.toNumber()
      );

      const index = keccak256(
        defaultAbiCoder.encode(
          ["address", "uint", "address"],
          [
            admin.address,
            bitmapIndex,
            "0x0000000000000000000000000000000000000001",
          ]
        )
      );

      await replayProtection.verifyPublic(
        callData,
        encodedReplayProtection,
        "0x0000000000000000000000000000000000000001",
        admin.address,
        signedCall
      );

      const nonce = await replayProtection.nonceStore(index);

      expect(nonce).to.eq(bitToFlip);
    }
  ).timeout("50000");

  fnIt<replayProtection>(
    (a) => a.verifyPublic,
    "access bitflip() via verify with wrong replay protection authority and it should fail",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const bitmapIndex = 6175;
      const bitToFlip = flipBit(new BigNumber("0"), new BigNumber("0"));

      const { callData, encodedReplayProtection, signedCall } = await signCall(
        replayProtection,
        "0x0000000000000000000000000000000000000000",
        admin,
        bitmapIndex,
        bitToFlip.toNumber()
      );

      await expect(
        replayProtection.verifyPublic(
          callData,
          encodedReplayProtection,
          "0x0000000000000000000000000000000000000000",
          admin.address,
          signedCall
        )
      ).to.be.revertedWith("Multinonce replay protection failed");
    }
  ).timeout("50000");

  fnIt<replayProtection>(
    (a) => a.verifyPublic,
    "submit same replay protection for bitflip() twice and it should fail",
    async () => {
      const { replayProtection, admin } = await loadFixture(
        createReplayProtection
      );

      const bitmapIndex = 321;
      const bitToFlip = flipBit(new BigNumber("0"), new BigNumber("0"));

      const { callData, encodedReplayProtection, signedCall } = await signCall(
        replayProtection,
        "0x0000000000000000000000000000000000000001",
        admin,
        bitmapIndex,
        bitToFlip.toNumber()
      );

      await replayProtection.verifyPublic(
        callData,
        encodedReplayProtection,
        "0x0000000000000000000000000000000000000001",
        admin.address,
        signedCall
      );

      const index = keccak256(
        defaultAbiCoder.encode(
          ["address", "uint", "address"],
          [
            admin.address,
            bitmapIndex,
            "0x0000000000000000000000000000000000000001",
          ]
        )
      );
      const nonce = await replayProtection.nonceStore(index);

      expect(nonce).to.eq(bitToFlip);

      await expect(
        replayProtection.verifyPublic(
          callData,
          encodedReplayProtection,
          "0x0000000000000000000000000000000000000001",
          admin.address,
          signedCall
        )
      ).to.be.revertedWith("Bitflip replay protection failed");
    }
  ).timeout("50000");
});
