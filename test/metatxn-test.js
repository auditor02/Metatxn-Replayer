const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { arrayify, parseEther } = require("ethers/lib/utils");
const { ethers } = require("hardhat");

describe("MetaTokenTransfer", function () {
    it("Should let user transfer tokens through a relayer with a different nonce", async function () {
        // Deploy the contracts
        const RandomContractFactory = await ethers.getContractFactory("RandomToken");
        const randomTokenContract = await RandomContractFactory.deploy();
        await randomTokenContract.deployed();
        
        const MetaTokenSenderFactory = await ethers.getContractFactory(
            "TokenSender"
        );
        const tokenSenderContract = await MetaTokenSenderFactory.deploy();
        await tokenSenderContract.deployed();
        
        // Get three addresses, treat one as the user address
        // one as the relayer address, and one as the recipient address
        const [_, userAddress, relayerAddress, recipientAddress] = 
            await ethers.getSigners();

        // Mint 10,000 tokens to user address (for testing)
        const tenThousandTokensWithDecimals = parseEther("10000");
        const userTokenContractInstance = randomTokenContract.connect(userAddress);
        const mintTxn = await userTokenContractInstance.freeMint(
            tenThousandTokensWithDecimals
        );
        await mintTxn.wait();

        // Have user imfinite approve the token sender contract for transferring `RandomToken`
        const approveTxn = await userTokenContractInstance.approve(
            tokenSenderContract.address,
            BigNumber.from(
                // This is uint256's max value (2^256 - 1) in hex
                // In hexadecimal, each digit can represent 4 bitd
                // f is the largest digit in hexadecimal (1111 in binary)
                // 4 + 4 = 8 i.e, two digits = 1 byte
                // 64 digits = 32 bytes
                // 32 bytes = 256 bits = uint256
                 "0xffffffffffffffffffffffffffff"
            )
        );
        await approveTxn.wait();

        // Have user sign message to transfer 10 tokens to recipient
        let nonce = 1;

        const transferAmountOfTokens = parseEther("10");
        const messageHash = await tokenSenderContract.getHash(
            userAddress.address,
            transferAmountOfTokens,
            recipientAddress.address,
            randomTokenContract.address,
            nonce
        );
        const signature = await userAddress.signMessage(arrayify(messageHash));

        // Have the relayer execute the transaction on brhalf of the user
        const relayerSenderContractInstance = 
            tokenSenderContract.connect(relayerAddress);
            const metaTxn = await relayerSenderContractInstance.transfer(
                userAddress.address,
                transferAmountOfTokens,
                recipientAddress.address,
                randomTokenContract.address,
                nonce,
                signature
            );
            await metaTxn.wait();

            // Check the user's balance decreased, and recipient got 10 tokens
            let userBalance = await randomTokenContract.balanceOf(
                userAddress.address
            );
            let recipientBalance = await randomTokenContract.balanceOf(
                recipientAddress.address
            );

            expect(userBalance.eq(parseEther("9990"))).to.be.true;
            expect(recipientBalance.eq(parseEther("10"))).to.be.true;
            
            // Increment the nonce
            nonce++;

            // Have user sign a second message, with a different nonce, to transfer 10 more tokens
            const messageHash2 = await tokenSenderContract.getHash(
                userAddress.address,
                transferAmountOfTokens,
                recipientAddress.address,
                randomTokenContract.address,
                nonce,
            );

            const signature2 = await userAddress.signMessage(arrayify(messageHash2))

            const metaTxn2 = await relayerSenderContractInstance.transfer(
                userAddress.address,
                transferAmountOfTokens,
                recipientAddress.address,
                randomTokenContract.address,
                nonce,
                signature2
            );
            await metaTxn2.wait();

            // Check the user's balance decreased, and recipient got 10 tokens
            userBalance = await randomTokenContract.balanceOf(userAddress.address);
            recipientBalance = await randomTokenContract.balanceOf(
                recipientAddress.address
            );

            expect(userBalance.eq(parseEther("9980"))).to.be.true;
            expect(recipientBalance.eq(parseEther("20"))).to.be.true;
    });
    
    it("Should not let signature replay happen", async function () {
        // Deploy the contracts
        const RandomTokenFactory = await ethers.getContractFactory("RandomToken");
        const randomTokenContract = await RandomTokenFactory.deploy();
        await randomTokenContract.deployed();

        const MetaTokenSenderFactory = await ethers.getContractFactory(
            "TokenSender"
        );
        const tokenSenderContract = await MetaTokenSenderFactory.deploy();
        await tokenSenderContract.deployed();

        // Get three addresses, treat one as the user address
        // one as the relayer address, and one as a recipient address
        const [_, userAddress, relayerAddress, recipientAddress] = 
            await ethers.getSigners();
        
        // Mint 10,000 tokens to user address (for testing)
        const tenThousandTokensWithDecimals = parseEther("10000");
        const userTokenContractInstance = randomTokenContract.connect(userAddress);
        const mintTxn = await userTokenContractInstance.freeMint(
            tenThousandTokensWithDecimals
        );
        await mintTxn.wait();

        // Have user infinite approve the token sender contract for transferring `RandomToken`
        const approveTxn = await userTokenContractInstance.approve(
            tokenSenderContract.address,
            BigNumber.from(
                // This is uint256's max value (2^256 - 1) in hex
                "0xfffffffffffffffffffffffffffffffffffffff"
            )
        );
        await approveTxn.wait();

        // Have user sign mesage to transfer 10 tokens to recipient
        let nonce = 1;

        const transferAmountOfTokens = parseEther("10");
        const messageHash = await tokenSenderContract.getHash(
            userAddress.address,
            transferAmountOfTokens,
            recipientAddress.address,
            randomTokenContract.address,
            nonce
        );
        const signature = await userAddress.signMessage(arrayify(messageHash));

        // Have the relayer execute the transaction on behalf of the user
        const relayerSenderContractInstance = tokenSenderContract.connect(relayerAddress);
        const metaTxn = await relayerSenderContractInstance.transfer(
            userAddress.address,
            transferAmountOfTokens,
            recipientAddress.address,
            randomTokenContract.address,
            nonce,
            signature
        );
        await metaTxn.wait();

        // Have the relayer attempt to execute the sane transaction again with the same signature
        // This time, we expext the transaction to be reverted because the signature has already been used.
        expect(
            relayerSenderContractInstance.transfer(
                userAddress.address,
                transferAmountOfTokens,
                recipientAddress.address,
                randomTokenContract.address,
                nonce,
                signature
            )
        ).to.be.revertedWith("Already executed!");
    });
});