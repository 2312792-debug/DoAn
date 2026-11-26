// Dat dia chi KY SO CHINH THUC cua nha truong vao Smart Contract (chi tai khoan admin goi duoc).
// Dia chi nay la dia chi in ra o log Backend luc khoi dong ("Dia chi ky so CHINH THUC...") hoac GET /api/signer.
// Cach dung: SIGNER=0x... npx hardhat run scripts/setAttestationSigner.js --network amoy
//
// Luu y: day la nhiem vu cua nha truong, nen cong bo CUNG dia chi nay (va dia chi hop dong) o
// kenh doc lap (website chinh thuc cua truong) de ben thu ba doi chieu - xem muc 4.3 cua bao cao.
const { ethers } = require("hardhat");
const contractInfo = require("../frontend/src/contractInfo.json");

async function main() {
  const signer = process.env.SIGNER;
  if (!signer || !ethers.isAddress(signer)) {
    throw new Error(
      "Thieu hoac sai bien moi truong SIGNER. Vi du: SIGNER=0x123... npx hardhat run scripts/setAttestationSigner.js --network amoy"
    );
  }

  const [admin] = await ethers.getSigners();
  const registry = await ethers.getContractAt("DiplomaRegistry", contractInfo.address, admin);

  // Xem ghi chu ve gas trong scripts/deploy.js - mot so RPC cong khai cua Amoy yeu cau gas tip cap toi thieu ~25 gwei.
  const tx = await registry.setAttestationSigner(signer, {
    maxPriorityFeePerGas: ethers.parseUnits("30", "gwei"),
    maxFeePerGas: ethers.parseUnits("60", "gwei"),
  });
  await tx.wait();

  console.log(`Da dat dia chi ky so chinh thuc = ${signer}. Tx: ${tx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
