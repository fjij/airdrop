//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @notice Contract that lets you airdrop ERC20 tokens.
 */
contract Airdrop {

    using Counters for Counters.Counter;

    Counters.Counter private nextId;

    struct Drop {
        bytes32 root;
        uint256 amount;
        IERC20 token;

        /// @dev Whether an account has already claimed this drop.
        mapping(address => bool) claimed;
    }

    mapping(uint256 => Drop) drops;

    /**
     * @notice Check whether a drop has been claimed by an address.
     * @param _account The account to check.
     * @param _id The id of the drop to check.
     */
    function checkDrop(
        address _account,
        uint256 _id
    ) external view returns (bool) {
        return drops[_id].claimed[_account];
    }

    /**
     * @notice Emitted when a drop is created.
     * @param id The id of the drop. Required to claim the drop.
     * @param root See {createDrop}.
     * @param amount See {createDrop}.
     * @param token See {createDrop}.
     */
    event CreateDrop(uint256 id, bytes32 root, uint256 amount, address token);

    /**
     * @notice Create a new drop.
     * @param _root The root of the merkle tree. Each leaf of the tree is the
     * keccak256 hash of the account and amount, abi pack encoded.
     * @param _amount The total amount in the drop. This contract must be
     * approved for at least this amount. It will be transferred to this
     * contract.
     * @param _token The address of the ERC20 token that is being dropped.
     */
    function createDrop(bytes32 _root, uint256 _amount, address _token) public {
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);
        nextId.increment();
        drops[nextId.current()].root = _root;
        drops[nextId.current()].amount = _amount;
        drops[nextId.current()].token = IERC20(_token);
        emit CreateDrop(nextId.current(), _root, _amount, _token);
    }

    event ClaimDrop(address account, uint256 id, uint256 amount);

    /**
     * @notice Claim a drop.
     * @param _id The number of tokens
     * @param _proof The merkle proof that the leaf is in the tree, as described
     * in {createDrop}. Assumes leaves are sorted.
     */
    function claimDrop(
        uint256 _id,
        uint256 _amount,
        bytes32[] calldata _proof
    ) public {
        require(!drops[_id].claimed[msg.sender], "already claimed");
        require(drops[_id].amount >= _amount, "not enough left");
        require(
            MerkleProof.verify(
                _proof,
                drops[_id].root,
                keccak256(abi.encodePacked(msg.sender, _amount))
            ),
            "bad proof"
        );
        drops[_id].token.transfer(msg.sender, _amount);
        drops[_id].amount -= _amount;
        drops[_id].claimed[msg.sender] = true;
        emit ClaimDrop(msg.sender, _id, _amount);
    }
}
