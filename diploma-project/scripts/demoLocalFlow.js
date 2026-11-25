// Chay thu toan bo luong: phat hanh -> xac minh dung -> thu file gia -> cap nhat -> thu hoi -> xac minh lai.
// Dung mang hardhat noi bo (khong can vi that, khong can testnet).
const { ethers } = require("hardhat");

function diplomaIdFrom(studentCode, programCode) {
  const normalized = `${studentCode.trim().toUpperCase()}-${programCode.trim().toUpperCase()}`;
  return ethers.keccak256(ethers.toUtf8Bytes(normalized));
}

function fakeHash(seed) {
  return ethers.keccak256(ethers.toUtf8Bytes(seed));
}

async function main() {
  const [admin, employer] = await ethers.getSigners();

  const Registry = await ethers.getContractFactory("DiplomaRegistry");
  const registry = await Registry.deploy(admin.address);
  await registry.waitForDeployment();
  console.log("1) Da deploy DiplomaRegistry tai:", await registry.getAddress());

  const diplomaId = diplomaIdFrom("2312792", "CTK47C");
  const fileHashGoc = fakeHash("noi-dung-file-pdf-goc");
  const cid = "bafybeigdyrztest000000000000000000000000000000000000000000";

  await (await registry.issueDiploma(diplomaId, fileHashGoc, cid)).wait();
  console.log("2) Da phat hanh van bang cho diplomaId:", diplomaId);

  let [isValid, status] = await registry.connect(employer).verify(diplomaId, fileHashGoc);
  console.log("3) Xac minh file GOC (dung) ->", isValid, "| status:", status.toString());

  const fileHashGia = fakeHash("noi-dung-file-pdf-DA-BI-SUA");
  [isValid, status] = await registry.connect(employer).verify(diplomaId, fileHashGia);
  console.log("4) Xac minh file GIA (bi sua) ->", isValid, "| status:", status.toString());

  const fileHashMoi = fakeHash("noi-dung-file-pdf-ban-cap-nhat");
  const cidMoi = "bafybeigdyrztest111111111111111111111111111111111111111111";
  await (await registry.updateDiploma(diplomaId, fileHashMoi, cidMoi)).wait();
  console.log("5) Da cap nhat van bang -> CID moi:", cidMoi);

  [isValid] = await registry.connect(employer).verify(diplomaId, fileHashMoi);
  console.log("6) Xac minh lai voi file MOI ->", isValid);

  await (await registry.revokeDiploma(diplomaId, "Phat hien gian lan ho so")).wait();
  console.log("7) Da thu hoi van bang.");

  [isValid, status] = await registry.connect(employer).verify(diplomaId, fileHashMoi);
  console.log("8) Xac minh sau khi thu hoi ->", isValid, "| status:", status.toString(), "(2 = Da thu hoi)");

  const idA = diplomaIdFrom("2312001", "CTK47C");
  const idB = diplomaIdFrom("2312002", "CTK47C");
  const idC = diplomaIdFrom("2312003", "CTK47C");
  const ketQuaBatch = await registry.issueBatch(
    [idA, idB, idC],
    [fakeHash("fileA"), fakeHash("fileB"), fakeHash("fileC")],
    ["cidA", "cidB", "cidC"]
  );
  await ketQuaBatch.wait();
  console.log("9) Da issueBatch 3 van bang trong 1 giao dich.");

  const tong = await registry.totalDiplomas();
  console.log("10) totalDiplomas() sau khi phat hanh them ->", tong.toString(), "(dem ca van bang o buoc 2)");

  const [trangIds, trangItems] = await registry.getDiplomasPage(0, 2);
  console.log(
    "11) getDiplomasPage(0, 2) ->",
    trangIds.length,
    "ban ghi, vi du ban ghi dau:",
    trangIds[0],
    "| cid:",
    trangItems[0].cid
  );

  console.log("\n=== DEMO HOAN TAT - toan bo luong dung nhu thiet ke ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
