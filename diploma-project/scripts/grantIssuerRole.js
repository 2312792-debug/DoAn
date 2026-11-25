// Cap ISSUER_ROLE cho 1 dia chi vi khac (vd: mot can bo phong dao tao khac).
// Cach dung: ACCOUNT=0x... npx hardhat run scripts/grantIssuerRole.js --network amoy
const { ethers } = require("hardhat");
const contractInfo = require("../frontend/src/contractInfo.json");

async function main() {
  const account = process.env.ACCOUNT;
  if (!account) {
    throw new Error("Thieu bien moi truong ACCOUNT. Vi du: ACCOUNT=0x123... npx hardhat run scripts/grantIssuerRole.js --network amoy");
  }

  const [admin] = await ethers.getSigners();
  const registry = await ethers.getContractAt("DiplomaRegistry", contractInfo.address, admin);

  // Xem ghi chu ve gas trong scripts/deploy.js - mot so RPC cong khai cua Amoy yeu cau
  // gas tip cap toi thieu ~25 gwei.
  const tx = await registry.grantIssuer(account, {
    maxPriorityFeePerGas: ethers.parseUnits("30", "gwei"),
    maxFeePerGas: ethers.parseUnits("60", "gwei"),
  });
  await tx.wait();

  console.log(`Da cap ISSUER_ROLE cho ${account}. Tx: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
