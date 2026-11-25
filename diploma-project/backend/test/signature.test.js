// Test chu ky so: ky -> xac thuc dung; sua 1 ky tu -> chu ky khong con thuoc ve nha truong.
process.env.DB_PATH = require("path").join(require("os").tmpdir(), "sigtest-" + Date.now(), "t.db");
process.env.SIGNING_PRIVATE_KEY = "0x" + "11".repeat(32);
const assert = require("assert");
const { signRecord, verifyAttestation, signerAddress, buildMessage } = require("../signer");
const { Wallet } = require("ethers");
const rec = { chainId: 80002, contract: "0x" + "ab".repeat(20), diplomaId: "0x" + "cd".repeat(32), fileHash: "0x" + "ef".repeat(32), cid: "QmTest", issuer: "0x" + "12".repeat(20), status: 1, at: 1700000000 };
function test(n, f) { return f().then(() => console.log("OK  -", n)).catch((e) => { console.log("FAIL-", n, "->", e.message); process.exitCode = 1; }); }
(async () => {
  const s = await signRecord(rec);
  await test("chu ky hop le khop dia chi ky chinh thuc", async () => assert.ok(verifyAttestation(s.message, s.signature, signerAddress).valid));
  await test("sua noi dung thong diep (doi CID) -> khong con khop", async () => {
    const tampered = buildMessage({ ...rec, cid: "QmGia" });
    assert.ok(!verifyAttestation(tampered, s.signature, signerAddress).valid);
  });
  await test("website khac ky bang khoa khac -> khong khop dia chi chinh thuc", async () => {
    const fake = await new Wallet("0x" + "22".repeat(32)).signMessage(s.message);
    assert.ok(!verifyAttestation(s.message, fake, signerAddress).valid);
  });
  await test("trang thai Revoked cho thong diep khac Valid", async () => assert.notStrictEqual(buildMessage({ ...rec, status: 2 }), s.message));
  console.log("=== signature tests done ===");
})();
