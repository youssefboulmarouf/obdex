import Web3 from 'web3';
import Dex from './contracts/Dex.json';
import ERC20Abi from './ERC20Abi.json';

const getWeb3 = () => {
    return new Promise((resolve, reject) => {
        // Wait for loading completion to avoid race conditions with web3 injection timing.
        window.addEventListener("load", async () => {
            // Modern dapp browsers...
            if (window.ethereum) {
                const web3 = new Web3(window.ethereum);
                try {
                // Request account access if needed
                await window.ethereum.enable();
                // Acccounts now exposed
                resolve(web3);
                } catch (error) {
                reject(error);
                }
            }
            // Legacy dapp browsers...
            else if (window.web3) {
                // Use Mist/MetaMask's provider.
                const web3 = window.web3;
                console.log("Injected web3 detected.");
                resolve(web3);
            }
            // Fallback to localhost; use dev console port by default...
            else {
                const provider = new Web3.providers.HttpProvider(
                "http://localhost:9545"
                );
                const web3 = new Web3(provider);
                console.log("No web3 instance injected, using Local web3.");
                resolve(web3);
            }
        });
    });
};

const getContracts = async web3 => {
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = Dex.networks[networkId];
    const dex = initContract(web3, Dex.abi, deployedNetwork && deployedNetwork.address);

    const tokens = await dex.methods.getTokens().call();
    
    const tokenContracts = tokens.reduce((acc, token) => ({
        ...acc,
        [hexToUtf8(web3, token.ticker)]: initContract(web3, ERC20Abi, token.tokenAddress)
    }), {});
    
    return { dex, ...tokenContracts };
}

// Converts from bytes32 to ASCII (human readable)
function hexToUtf8(web3, bytes32Ticker) {
    return web3.utils.hexToUtf8(bytes32Ticker);
}

// Init contract
function initContract(web3, abi, tokenAddress) {
    return new web3.eth.Contract(abi, tokenAddress);
}

export { getWeb3, getContracts };