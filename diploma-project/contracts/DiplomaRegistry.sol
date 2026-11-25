// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title DiplomaRegistry
/// @notice Luu mã băm (hash) + CID IPFS cua van bang tren blockchain de chong gia mao.
/// @dev Trang thai: 0 = ChuaPhatHanh, 1 = HopLe, 2 = DaThuHoi
contract DiplomaRegistry is AccessControl {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    enum Status {
        None,
        Valid,
        Revoked
    }

    struct Diploma {
        bytes32 fileHash;
        string cid;
        address issuer;
        uint64 issuedAt;
        Status status;
    }

    mapping(bytes32 => Diploma) private diplomas;

    /// @dev Danh sach toan bo diplomaId da tung phat hanh, phuc vu liet ke/dem on-chain
    /// (khong phu thuoc eth_getLogs - vi nhieu RPC node cong khai gioi han/xoa lich su log cu).
    bytes32[] private _allIds;
    /// @dev Chong trung lap trong _allIds khi mot diplomaId duoc phat hanh lai sau khi bi thu hoi.
    mapping(bytes32 => bool) private _seen;

    event DiplomaIssued(bytes32 indexed diplomaId, bytes32 fileHash, string cid, address indexed issuer, uint64 issuedAt);
    event DiplomaUpdated(bytes32 indexed diplomaId, bytes32 newFileHash, string newCid, address indexed updater, uint64 updatedAt);
    event DiplomaRevoked(bytes32 indexed diplomaId, string reason, address indexed revoker, uint64 revokedAt);

    error AlreadyIssued(bytes32 diplomaId);
    error NotIssued(bytes32 diplomaId);
    error AlreadyRevoked(bytes32 diplomaId);
    error ArrayLengthMismatch();
    error EmptyBatch();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ISSUER_ROLE, admin);
    }

    /// @notice Phat hanh van bang moi. Chi tai khoan co ISSUER_ROLE.
    /// @dev Cho phep phat hanh lai neu van bang chua tung ton tai (None) HOAC da bi thu hoi
    /// truoc do (Revoked) - vd: thu hoi do phat hien loi roi sua xong phat hanh lai. Chi chan
    /// khi van bang dang o trang thai Hop le (tranh ghi de mot ban ghi con hieu luc).
    function issueDiploma(bytes32 diplomaId, bytes32 fileHash, string calldata cid) external onlyRole(ISSUER_ROLE) {
        _issueOne(diplomaId, fileHash, cid);
    }

    /// @notice Phat hanh nhieu van bang trong 1 giao dich (phuc vu nhap hang loat tu Excel/CSV).
    /// @dev Khac voi issueDiploma: KHONG revert toan bo lo khi gap 1 diplomaId da Hop le - chi
    /// bo qua ban ghi do va bao false trong mang ket qua, cac ban ghi con lai van duoc phat hanh.
    /// Ly do: 1 dong loi trong file Excel/CSV hang tram dong khong nen lam hong ca lo.
    /// @return ok mang bool cung thu tu voi diplomaIds: true = da phat hanh, false = bi bo qua (da Hop le tu truoc).
    function issueBatch(
        bytes32[] calldata diplomaIds,
        bytes32[] calldata fileHashes,
        string[] calldata cids
    ) external onlyRole(ISSUER_ROLE) returns (bool[] memory ok) {
        uint256 n = diplomaIds.length;
        if (n == 0) revert EmptyBatch();
        if (fileHashes.length != n || cids.length != n) revert ArrayLengthMismatch();

        ok = new bool[](n);
        for (uint256 i = 0; i < n; i++) {
            if (diplomas[diplomaIds[i]].status == Status.Valid) {
                ok[i] = false;
                continue;
            }
            _issueOne(diplomaIds[i], fileHashes[i], cids[i]);
            ok[i] = true;
        }
    }

    function _issueOne(bytes32 diplomaId, bytes32 fileHash, string calldata cid) private {
        if (diplomas[diplomaId].status == Status.Valid) revert AlreadyIssued(diplomaId);

        diplomas[diplomaId] = Diploma({
            fileHash: fileHash,
            cid: cid,
            issuer: msg.sender,
            issuedAt: uint64(block.timestamp),
            status: Status.Valid
        });

        if (!_seen[diplomaId]) {
            _seen[diplomaId] = true;
            _allIds.push(diplomaId);
        }

        emit DiplomaIssued(diplomaId, fileHash, cid, msg.sender, uint64(block.timestamp));
    }

    /// @notice Cap nhat lai file/CID cua mot van bang da phat hanh (vd: sua loi metadata).
    /// @dev Khong doi issuer/issuedAt goc, chi cap nhat hash + cid va bat event moi.
    function updateDiploma(bytes32 diplomaId, bytes32 newFileHash, string calldata newCid) external onlyRole(ISSUER_ROLE) {
        Diploma storage d = diplomas[diplomaId];
        if (d.status == Status.None) revert NotIssued(diplomaId);
        if (d.status == Status.Revoked) revert AlreadyRevoked(diplomaId);

        d.fileHash = newFileHash;
        d.cid = newCid;

        emit DiplomaUpdated(diplomaId, newFileHash, newCid, msg.sender, uint64(block.timestamp));
    }

    /// @notice Thu hoi van bang (vd: phat hien gian lan).
    function revokeDiploma(bytes32 diplomaId, string calldata reason) external onlyRole(ISSUER_ROLE) {
        Diploma storage d = diplomas[diplomaId];
        if (d.status == Status.None) revert NotIssued(diplomaId);
        if (d.status == Status.Revoked) revert AlreadyRevoked(diplomaId);

        d.status = Status.Revoked;

        emit DiplomaRevoked(diplomaId, reason, msg.sender, uint64(block.timestamp));
    }

    /// @notice Doi soat file nguoi dung tai len (hash) voi du lieu tren chain. Public - ai cung goi duoc.
    function verify(bytes32 diplomaId, bytes32 fileHash)
        external
        view
        returns (bool isValid, Status status, string memory cid, address issuer, uint64 issuedAt)
    {
        Diploma memory d = diplomas[diplomaId];
        status = d.status;
        cid = d.cid;
        issuer = d.issuer;
        issuedAt = d.issuedAt;
        isValid = (d.status == Status.Valid) && (d.fileHash == fileHash);
    }

    /// @notice Tra ve toan bo du lieu tho cua mot van bang (khong can hash de doi soat).
    function getDiploma(bytes32 diplomaId) external view returns (Diploma memory) {
        return diplomas[diplomaId];
    }

    /// @notice Tong so diplomaId da tung phat hanh (dung de liet ke/dem, khong doc tu event log).
    function totalDiplomas() external view returns (uint256) {
        return _allIds.length;
    }

    /// @notice diplomaId theo vi tri index (0-based) trong danh sach da phat hanh.
    function diplomaIdAt(uint256 index) external view returns (bytes32) {
        return _allIds[index];
    }

    /// @notice Lay 1 trang du lieu day du (id + thong tin) de hien thi bang danh sach o Dashboard.
    /// @dev offset/limit de tranh tra ve mang qua lon trong 1 lan goi (out-of-gas o phia node).
    function getDiplomasPage(uint256 offset, uint256 limit)
        external
        view
        returns (bytes32[] memory ids, Diploma[] memory items)
    {
        uint256 total = _allIds.length;
        if (offset >= total) {
            return (new bytes32[](0), new Diploma[](0));
        }
        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 n = end - offset;

        ids = new bytes32[](n);
        items = new Diploma[](n);
        for (uint256 i = 0; i < n; i++) {
            bytes32 id = _allIds[offset + i];
            ids[i] = id;
            items[i] = diplomas[id];
        }
    }

    /// @notice Cap quyen phat hanh cho tai khoan khac. Chi admin.
    function grantIssuer(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        grantRole(ISSUER_ROLE, account);
    }

    /// @notice Thu hoi quyen phat hanh cua mot tai khoan. Chi admin.
    function revokeIssuer(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        revokeRole(ISSUER_ROLE, account);
    }
}
