const { ethers, network } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Mot so RPC cong khai cua Polygon Amoy (vd publicnode.com) yeu cau "gas tip cap" toi thieu
// ~25 gwei va se tu choi giao dich neu ethers/hardhat tu uoc luong thap hon. Dat san muc gas
// du cao de tranh loi "transaction gas price below minimum" - khong anh huong gi vi la POL
// testnet, khong co gia tri thuc.
const TX_OVERRIDES = {
  maxPriorityFeePerGas: ethers.parseUnits("30", "gwei"),
  maxFeePerGas: ethers.parseUnits("60", "gwei"),
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploy boi tai khoan:", deployer.address);

  const Registry = await ethers.getContractFactory("DiplomaRegistry");
  const registry = await Registry.deploy(deployer.address, TX_OVERRIDES);
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("DiplomaRegistry deployed tai:", address);

  const deployReceipt = await registry.deploymentTransaction().wait();
  const deployedBlock = deployReceipt.blockNumber;
  console.log("Deploy o block:", deployedBlock);

  const artifact = require(path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "DiplomaRegistry.sol",
    "DiplomaRegistry.json"
  ));

  const explorerBaseUrls = {
    amoy: "https://amoy.polygonscan.com",
    sepolia: "https://sepolia.etherscan.io",
  };
  const rpcUrls = {
    amoy: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
    sepolia: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
  };

  const contractInfo = {
    address,
    abi: artifact.abi,
    network: network.name,
    rpcUrl: rpcUrls[network.name] || "",
    explorerBaseUrl: explorerBaseUrls[network.name] || "",
    deployedBlock,
  };

  const outPath = path.join(__dirname, "..", "frontend", "src", "contractInfo.json");
  fs.writeFileSync(outPath, JSON.stringify(contractInfo, null, 2));
  console.log("Da ghi contractInfo.json vao:", outPath);
  console.log("\n>>> Nho luu lai dia chi contract nay va cap ISSUER_ROLE cho cac tai khoan can thiet.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
