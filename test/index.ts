import { expect } from "chai";
import { ethers } from "hardhat";

import keccak256 from "keccak256";
import { MerkleTree } from "merkletreejs";

import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import type { Airdrop, TestERC20 } from "../typechain";

const { BigNumber } = ethers;

const junk =
  "0x47f5331b1a86123eed2cfcc72f1a7500252c39157988c9fb7fb12f28eb8018da";

describe("Airdrop", () => {

  let accountA: SignerWithAddress;
  let accountB: SignerWithAddress;
  let accountC: SignerWithAddress;
  let token: TestERC20;
  let airdrop: Airdrop;

  interface Entry {
    account: string;
    amount: number;
  }

  interface LeafedEntry extends Entry {
    leaf: Buffer;
  }

  const leafify = ({ account, amount }: Entry): LeafedEntry => ({
    leaf: Buffer.from(
      ethers.utils.solidityKeccak256(
        ['address', 'uint256'],
        [account, amount],
      ).slice(2),
      'hex',
    ),
    account,
    amount,
  });

  beforeEach(async () => {
    [accountA, accountB, accountC] = await ethers.getSigners();

    const TestERC20Factory = await ethers.getContractFactory("TestERC20");
    token = await TestERC20Factory.connect(accountA).deploy(1000);

    const AirdropFactory = await ethers.getContractFactory("Airdrop");
    airdrop = await AirdropFactory.deploy();
  });

  it("should be able to create and claim airdrops", async () => {
    await token.connect(accountA).approve(airdrop.address, 100);
    const entries = [
      { account: accountB.address, amount: 50 },
      { account: accountC.address, amount: 50 },
    ].map(leafify);
    const tree = new MerkleTree(
      entries.map(({ leaf }) => leaf),
      keccak256,
      { sortPairs: true },
    );
    await airdrop.connect(accountA).createDrop(
      tree.getHexRoot(),
      100,
      token.address,
    );
    await airdrop.connect(accountB)
      .claimDrop(1, 50, tree.getHexProof(entries[0].leaf));

    expect(await token.balanceOf(accountB.address)).to.eql(BigNumber.from(50));
    await airdrop.connect(accountC)
      .claimDrop(1, 50, tree.getHexProof(entries[1].leaf));
    expect(await token.balanceOf(accountC.address)).to.eql(BigNumber.from(50));
  });

  describe("createDrop", () => {
    it("transfers the amount to the contract", async () => {
      await token.connect(accountA).approve(airdrop.address, 100);
      await expect(airdrop.connect(accountA).createDrop(
        junk,
        100,
        token.address,
      )).to.emit(airdrop, "CreateDrop")
        .withArgs(1, junk, 100, token.address);
      expect(await token.balanceOf(airdrop.address))
        .to.eql(BigNumber.from(100));
    });
  });

  describe("claimDrop", () => {
    let tree: MerkleTree;
    let entries: LeafedEntry[];
    beforeEach(async () => {
      await token.connect(accountA).approve(airdrop.address, 100);
      entries = [
        { account: accountA.address, amount: 100 },
        { account: accountB.address, amount: 50 },
        { account: accountC.address, amount: 50 },
      ].map(leafify);
      tree = new MerkleTree(
        entries.map(({ leaf }) => leaf),
        keccak256,
        { sortPairs: true },
      );
      await airdrop.connect(accountA).createDrop(
        tree.getHexRoot(),
        100,
        token.address,
      );
    });
    it("transfers the claimed amount", async () => {
      await expect(airdrop.connect(accountB)
        .claimDrop(1, 50, tree.getHexProof(entries[1].leaf)))
        .to.emit(airdrop, "ClaimDrop")
        .withArgs(accountB.address, 1, BigNumber.from(50));
      expect(await token.balanceOf(accountB.address))
        .to.eql(BigNumber.from(50));
    });
    it("reverts once the amount is depleted", async () => {
      await airdrop.connect(accountA)
        .claimDrop(1, 100, tree.getHexProof(entries[0].leaf));
      await expect(airdrop.connect(accountB)
        .claimDrop(1, 50, tree.getHexProof(entries[1].leaf)))
        .to.be.revertedWith("not enough left");
    });
    it("reverts when already claimed", async () => {
      await airdrop.connect(accountB)
        .claimDrop(1, 50, tree.getHexProof(entries[1].leaf));
      await expect(airdrop.connect(accountB)
        .claimDrop(1, 50, tree.getHexProof(entries[1].leaf)))
        .to.be.revertedWith("already claimed");
    });
    it("reverts when a bad proof is provided", async () => {
      await expect(airdrop.connect(accountB)
        .claimDrop(1, 50, [junk, junk])).to.be.revertedWith("bad proof");
    });
  });

  describe("checkDrop", () => {
    it("returns whether a drop has been claimed by an address", async () => {
      await token.connect(accountA).approve(airdrop.address, 100);
      const entries = [
        { account: accountB.address, amount: 100 },
      ].map(leafify);
      const tree = new MerkleTree(
        entries.map(({ leaf }) => leaf),
        keccak256,
        { sortPairs: true },
      );
      await airdrop.connect(accountA).createDrop(
        tree.getHexRoot(),
        100,
        token.address,
      );
      expect(await airdrop.checkDrop(accountB.address, 1)).to.be.false;
      await airdrop.connect(accountB)
        .claimDrop(1, 100, tree.getHexProof(entries[0].leaf));
      expect(await airdrop.checkDrop(accountB.address, 1)).to.be.true;
    });
  });
});
