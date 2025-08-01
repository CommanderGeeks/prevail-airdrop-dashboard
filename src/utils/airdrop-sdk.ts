import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import { AnchorWallet } from '@solana/wallet-adapter-react';
import IDL from '../../idl/airdrop_program.json';


export class AirdropSDK {
  private connection: Connection;
  private program: Program;
  private provider: AnchorProvider;
  
  // Program ID - replace with your deployed program ID
  private static PROGRAM_ID = new PublicKey('Airdrop11111111111111111111111111111111111');

  constructor(
    connection: Connection,
    wallet: WalletContextState
  ) {
    this.connection = connection;
    
    // Create provider
    this.provider = new AnchorProvider(
      connection,
      wallet as any,
      { commitment: 'confirmed' }
    );
    
    // Create program
    this.program = new Program(AIRDROP_IDL, AirdropSDK.PROGRAM_ID, this.provider);
  }

  /**
   * Get the PDA for airdrop state
   */
  async getAirdropStatePDA(): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from('airdrop_state')],
      this.program.programId
    );
  }

  /**
   * Get the PDA for recipient data
   */
  async getRecipientDataPDA(recipient: PublicKey): Promise<[PublicKey, number]> {
    return PublicKey.findProgramAddress(
      [Buffer.from('recipient_data'), recipient.toBuffer()],
      this.program.programId
    );
  }

  /**
   * Initialize the airdrop program (only needs to be called once)
   */
  async initialize(): Promise<string> {
    const [airdropState] = await this.getAirdropStatePDA();
    
    const tx = await this.program.methods
      .initialize()
      .accounts({
        airdropState,
        owner: this.provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    return tx;
  }

  /**
   * Execute an airdrop to multiple recipients
   */
  async executeAirdrop(
    recipients: string[],
    amountsInSol: number[]
  ): Promise<string> {
    if (recipients.length !== amountsInSol.length) {
      throw new Error('Recipients and amounts arrays must have the same length');
    }

    const [airdropState] = await this.getAirdropStatePDA();
    
    // Convert SOL amounts to lamports
    const amountsInLamports = amountsInSol.map(sol => new BN(sol * LAMPORTS_PER_SOL));
    
    // Convert recipient strings to PublicKeys
    const recipientPubkeys = recipients.map(addr => new PublicKey(addr));

    // For simplicity, using first recipient as loader
    // In production, you'd implement proper batching
    const tx = await this.program.methods
      .airdrop(recipientPubkeys, amountsInLamports)
      .accounts({
        airdropState,
        owner: this.provider.wallet.publicKey,
        recipientLoader: recipientPubkeys[0],
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    return tx;
  }

  /**
   * Get total amount airdropped
   */
  async getTotalAirdropped(): Promise<number> {
    const [airdropState] = await this.getAirdropStatePDA();
    
    const state = await this.program.account.airdropState.fetch(airdropState);
    return state.totalAirdropped.toNumber() / LAMPORTS_PER_SOL;
  }

  /**
   * Get airdrop statistics
   */
  async getStats(): Promise<{
    totalAirdropped: number;
    totalAirdrops: number;
    owner: string;
  }> {
    const [airdropState] = await this.getAirdropStatePDA();
    
    const state = await this.program.account.airdropState.fetch(airdropState);
    
    return {
      totalAirdropped: state.totalAirdropped.toNumber() / LAMPORTS_PER_SOL,
      totalAirdrops: state.totalAirdrops.toNumber(),
      owner: state.owner.toString(),
    };
  }

  /**
   * Get amount received by a specific recipient
   */
  async getRecipientAmount(recipient: string): Promise<number> {
    const recipientPubkey = new PublicKey(recipient);
    const [recipientDataPDA] = await this.getRecipientDataPDA(recipientPubkey);
    
    try {
      const recipientData = await this.program.account.recipientData.fetch(recipientDataPDA);
      return recipientData.amountReceived.toNumber() / LAMPORTS_PER_SOL;
    } catch {
      // Account doesn't exist, recipient hasn't received anything
      return 0;
    }
  }

  /**
   * Listen for airdrop events
   */
  subscribeToAirdropEvents(callback: (event: any) => void): number {
    return this.program.addEventListener('AirdropBatchEvent', callback);
  }

  /**
   * Remove event listener
   */
  unsubscribeFromAirdropEvents(listenerId: number): void {
    this.program.removeEventListener(listenerId);
  }
}

// ===== Usage Example =====
/*
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection, clusterApiUrl } from '@solana/web3.js';

function MyComponent() {
  const wallet = useWallet();
  const connection = new Connection(clusterApiUrl('devnet'));
  
  const handleAirdrop = async () => {
    const sdk = new AirdropSDK(connection, wallet);
    
    // Execute airdrop
    const recipients = [
      '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      '9WzDnYfhBz3Dv3YiPEZJCcUyBm8vUVPvKKBSUMEPvLea'
    ];
    const amounts = [1.5, 2.0]; // in SOL
    
    try {
      const txId = await sdk.executeAirdrop(recipients, amounts);
      console.log('Airdrop successful:', txId);
      
      // Get updated stats
      const stats = await sdk.getStats();
      console.log('Total airdropped:', stats.totalAirdropped);
    } catch (error) {
      console.error('Airdrop failed:', error);
    }
  };
}
*/