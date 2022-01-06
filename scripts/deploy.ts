import { ethers } from "hardhat";

async function main() {
  const AirdropFactory = await ethers.getContractFactory("Airdrop");
  const airdrop = await AirdropFactory.deploy();

  await airdrop.deployed();

  console.log("Airdrop deployed to:", airdrop.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
