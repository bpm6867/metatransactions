import { ethers } from "ethers";
import { deployMetaTxContracts } from "./deploy"

export const ADMIN_MNEMONIC = "";
/**
 * Set up the provider and wallet
 */
async function setup() {
  const infuraProvider = new ethers.providers.InfuraProvider(
    "ropsten",
    "7333c8bcd07b4a179b0b0a958778762b"
  );

  const adminMnemonicWallet = ethers.Wallet.fromMnemonic(ADMIN_MNEMONIC);
  const admin = adminMnemonicWallet.connect(infuraProvider);
  return {
    admin,
    provider: infuraProvider,
  };
}


(async () => {
    // Set up wallets & provider
    const { admin } = await setup();
  
    await deployMetaTxContracts(admin, true);
  
  })().catch((e) => {
    console.log(e);
    // Deal with the fact the chain failed
  });
  