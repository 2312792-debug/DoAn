const { expect } = require("chai");
const { ethers } = require("hardhat");

function diplomaIdFrom(studentCode, programCode) {
  const normalized = `${studentCode.trim().toUpperCase()}-${programCode.trim().toUpperCase()}`;
  return ethers.keccak256(ethers.toUtf8Bytes(normalized));
}

function fakeHash(seed) {
  return ethers.keccak256(ethers.toUtf8Bytes(seed));
}

describe("DiplomaRegistry", function () {
  let registry, admin, issuer2, outsider, employer;
  const diplomaId = diplomaIdFrom("2312792", "CTK47C");
  const cid = "bafybeigdyrztest000000000000000000000000000000000000000000";

  beforeEach(async function () {
    [admin, issuer2, outsider, employer] = await ethers.getSigners();
    const Registry = await ethers.getContractFactory("DiplomaRegistry");
    registry = await Registry.deploy(admin.address);
    await registry.waitForDeployment();
  });

  it("1. Phat hanh van bang thanh cong va bat dung event", async function () {
    const fileHash = fakeHash("file-goc");
    await expect(registry.issueDiploma(diplomaId, fileHash, cid))
      .to.emit(registry, "DiplomaIssued")
      .withArgs(diplomaId, fileHash, cid, admin.address, anyUint());

    const [isValid, status] = await registry.verify(diplomaId, fileHash);
    expect(isValid).to.equal(true);
    expect(status).to.equal(1); // Valid
  });

  it("2. Phat hien file bi sua (hash khac khong khop)", async function () {
    const fileHashGoc = fakeHash("file-goc");
    const fileHashBiSua = fakeHash("file-da-bi-chinh-sua");
    await registry.issueDiploma(diplomaId, fileHashGoc, cid);

    const [isValid] = await registry.verify(diplomaId, fileHashBiSua);
    expect(isValid).to.equal(false);
  });

  it("3. Chan tai khoan khong co ISSUER_ROLE phat hanh", async function () {
    const fileHash = fakeHash("file-goc");
    await expect(
      registry.connect(outsider).issueDiploma(diplomaId, fileHash, cid)
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("4. Chan phat hanh trung diplomaId da ton tai", async function () {
    const fileHash = fakeHash("file-goc");
    await registry.issueDiploma(diplomaId, fileHash, cid);
    await expect(registry.issueDiploma(diplomaId, fileHash, cid)).to.be.revertedWithCustomError(
      registry,
      "AlreadyIssued"
    );
  });

  it("5. Thu hoi van bang - sau khi thu hoi, verify tra ve false", async function () {
    const fileHash = fakeHash("file-goc");
    await registry.issueDiploma(diplomaId, fileHash, cid);

    await expect(registry.revokeDiploma(diplomaId, "Phat hien gian lan"))
      .to.emit(registry, "DiplomaRevoked")
      .withArgs(diplomaId, "Phat hien gian lan", admin.address, anyUint());

    const [isValid, status] = await registry.verify(diplomaId, fileHash);
    expect(isValid).to.equal(false);
    expect(status).to.equal(2); // Revoked
  });

  it("6. Cap nhat lai van bang (sua metadata) - hash moi khop, hash cu khong khop nua", async function () {
    const fileHashCu = fakeHash("file-v1");
    const fileHashMoi = fakeHash("file-v2-da-sua-loi-chinh-ta");
    const cidMoi = "bafybeigdyrztest1111111111111111111111111111111111111111";

    await registry.issueDiploma(diplomaId, fileHashCu, cid);

    await expect(registry.updateDiploma(diplomaId, fileHashMoi, cidMoi))
      .to.emit(registry, "DiplomaUpdated")
      .withArgs(diplomaId, fileHashMoi, cidMoi, admin.address, anyUint());

    const [isValidMoi] = await registry.verify(diplomaId, fileHashMoi);
    const [isValidCu] = await registry.verify(diplomaId, fileHashCu);
    expect(isValidMoi).to.equal(true);
    expect(isValidCu).to.equal(false);
  });

  it("7. Admin cap quyen ISSUER_ROLE cho tai khoan khac", async function () {
    const fileHash = fakeHash("file-goc");
    await expect(
      registry.connect(issuer2).issueDiploma(diplomaId, fileHash, cid)
    ).to.be.reverted;

    await registry.grantIssuer(issuer2.address);
    await expect(registry.connect(issuer2).issueDiploma(diplomaId, fileHash, cid)).to.not.be.reverted;
  });

  it("8. employer (bat ky ai) co the goi verify ma khong can quyen gi", async function () {
    const fileHash = fakeHash("file-goc");
    await registry.issueDiploma(diplomaId, fileHash, cid);
    const [isValid] = await registry.connect(employer).verify(diplomaId, fileHash);
    expect(isValid).to.equal(true);
  });

  it("9. Phat hanh lai duoc sau khi da thu hoi (khong bi khoa cung)", async function () {
    const fileHashCu = fakeHash("file-v1");
    await registry.issueDiploma(diplomaId, fileHashCu, cid);
    await registry.revokeDiploma(diplomaId, "Thu hoi de test phat hanh lai");

    const fileHashMoi = fakeHash("file-v2-phat-hanh-lai");
    const cidMoi = "bafybeigdyrztest222222222222222222222222222222222222222222";
    await expect(registry.issueDiploma(diplomaId, fileHashMoi, cidMoi))
      .to.emit(registry, "DiplomaIssued")
      .withArgs(diplomaId, fileHashMoi, cidMoi, admin.address, anyUint());

    const [isValid, status] = await registry.verify(diplomaId, fileHashMoi);
    expect(isValid).to.equal(true);
    expect(status).to.equal(1); // Valid tro lai

    // Van bang dang Hop le (khong phai Revoked) thi khong duoc phat hanh de len tren no
    await expect(registry.issueDiploma(diplomaId, fileHashMoi, cidMoi)).to.be.revertedWithCustomError(
      registry,
      "AlreadyIssued"
    );
  });

  it("10. issueBatch: phat hanh nhieu van bang trong 1 giao dich, tang dung totalDiplomas", async function () {
    const ids = [diplomaIdFrom("2312001", "CTK47C"), diplomaIdFrom("2312002", "CTK47C"), diplomaIdFrom("2312003", "CTK47C")];
    const hashes = [fakeHash("f1"), fakeHash("f2"), fakeHash("f3")];
    const cids = ["cid1", "cid2", "cid3"];

    const results = await registry.issueBatch.staticCall(ids, hashes, cids);
    expect(results).to.deep.equal([true, true, true]);

    await registry.issueBatch(ids, hashes, cids);
    expect(await registry.totalDiplomas()).to.equal(3);
  });

  it("11. issueBatch: bo qua (khong revert ca lo) khi 1 phan tu da duoc phat hanh truoc do", async function () {
    const idA = diplomaIdFrom("2312010", "CTK47C");
    const idB = diplomaIdFrom("2312011", "CTK47C");
    await registry.issueDiploma(idA, fakeHash("goc"), "cid-goc");

    const results = await registry
      .issueBatch
      .staticCall([idA, idB], [fakeHash("bi-de"), fakeHash("moi")], ["cid-bi-de", "cid-moi"]);
    expect(results).to.deep.equal([false, true]);

    await registry.issueBatch([idA, idB], [fakeHash("bi-de"), fakeHash("moi")], ["cid-bi-de", "cid-moi"]);

    // idA khong bi ghi de boi phan tu trung trong batch
    const dA = await registry.getDiploma(idA);
    expect(dA.cid).to.equal("cid-goc");
    // idB duoc phat hanh binh thuong
    const dB = await registry.getDiploma(idB);
    expect(dB.cid).to.equal("cid-moi");
  });

  it("12. issueBatch: revert khi do dai 3 mang khong khop nhau", async function () {
    const id1 = diplomaIdFrom("2312020", "CTK47C");
    await expect(
      registry.issueBatch([id1], [fakeHash("a"), fakeHash("b")], ["only-one-cid"])
    ).to.be.revertedWithCustomError(registry, "ArrayLengthMismatch");
  });

  it("13. issueBatch: revert khi mang rong; va chan tai khoan khong co ISSUER_ROLE", async function () {
    await expect(registry.issueBatch([], [], [])).to.be.revertedWithCustomError(registry, "EmptyBatch");

    const id1 = diplomaIdFrom("2312021", "CTK47C");
    await expect(
      registry.connect(outsider).issueBatch([id1], [fakeHash("a")], ["cid-a"])
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
  });

  it("14. diplomaIdAt / getDiplomasPage: liet ke dung thu tu, phan trang dung, offset vuot qua tra ve rong", async function () {
    const ids = [diplomaIdFrom("2312030", "A"), diplomaIdFrom("2312031", "A"), diplomaIdFrom("2312032", "A")];
    const hashes = [fakeHash("a"), fakeHash("b"), fakeHash("c")];
    const cids = ["ca", "cb", "cc"];
    await registry.issueBatch(ids, hashes, cids);

    expect(await registry.diplomaIdAt(0)).to.equal(ids[0]);
    expect(await registry.diplomaIdAt(2)).to.equal(ids[2]);

    const [pageIds, pageItems] = await registry.getDiplomasPage(1, 2);
    expect(pageIds).to.deep.equal([ids[1], ids[2]]);
    expect(pageItems[0].cid).to.equal("cb");

    const [emptyIds] = await registry.getDiplomasPage(999, 10);
    expect(emptyIds.length).to.equal(0);
  });

  it("15. setAttestationSigner: admin dat dia chi ky so, bat dung event, getter tra ve dung; mac dinh la dia chi 0", async function () {
    expect(await registry.attestationSigner()).to.equal(ethers.ZeroAddress);

    await expect(registry.setAttestationSigner(employer.address))
      .to.emit(registry, "AttestationSignerSet")
      .withArgs(employer.address, admin.address);

    expect(await registry.attestationSigner()).to.equal(employer.address);

    // Admin doi sang dia chi khac duoc (vd doi khoa ky), ban ghi moi ghi de ban cu
    await registry.setAttestationSigner(outsider.address);
    expect(await registry.attestationSigner()).to.equal(outsider.address);
  });

  it("16. setAttestationSigner: chan tai khoan khong phai admin (ke ca khi dang co ISSUER_ROLE)", async function () {
    await expect(
      registry.connect(outsider).setAttestationSigner(employer.address)
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");

    await registry.grantIssuer(issuer2.address); // co ISSUER_ROLE nhung khong phai DEFAULT_ADMIN_ROLE
    await expect(
      registry.connect(issuer2).setAttestationSigner(employer.address)
    ).to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");

    expect(await registry.attestationSigner()).to.equal(ethers.ZeroAddress);
  });

  it("17. setAttestationSigner: tu choi dia chi 0 (tranh vo tinh xoa/lam hong dia chi chinh thuc)", async function () {
    await registry.setAttestationSigner(employer.address);
    await expect(registry.setAttestationSigner(ethers.ZeroAddress)).to.be.revertedWithCustomError(
      registry,
      "InvalidSigner"
    );
    expect(await registry.attestationSigner()).to.equal(employer.address);
  });
});

// Helper de khong phai import anyValue tu @nomicfoundation/hardhat-chai-matchers/withArgs
function anyUint() {
  const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
  return anyValue;
}
