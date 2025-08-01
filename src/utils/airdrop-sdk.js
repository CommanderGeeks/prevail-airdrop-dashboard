import { Connection, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { AnchorProvider, Program, BN } from '@coral-xyz/anchor';
import {AIRDROP_IDL} from './idl/airdrop_idl'; // Adjust the path as necessary

export class AirdropSDK {
  // Program ID - replace with your deployed program ID
  static PROGRAM_ID = new PublicKey('Airdrop11111111111111111111111111111111111');

  constructor(connection, wallet) {
    this.connection = connection;
    
    // Create provider
    this.provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed' }
    );
    
    // Create program
    this.program = new Program(AIRDROP_IDL, AirdropSDK.PROGRAM_ID, this.provider);
  }

  /**
   * Get the PDA for airdrop state
   */
  async getAirdropStatePDA() {
    return PublicKey.findProgramAddress(
      [Buffer.from('airdrop_state')],
      this.program.programId
    );
  }

  /**
   * Get the PDA for recipient data
   */
  async getRecipientDataPDA(recipient) {
    return PublicKey.findProgramAddress(
      [Buffer.from('recipient_data'), recipient.toBuffer()],
      this.program.programId
    );
  }

  /**
   * Initialize the airdrop program (only needs to be called once)
   */
  async initialize() {
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
  async executeAirdrop(recipients, amountsInSol) {
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
  async getTotalAirdropped() {
    const [airdropState] = await this.getAirdropStatePDA();
    
    const state = await this.program.account.airdropState.fetch(airdropState);
    return state.totalAirdropped.toNumber() / LAMPORTS_PER_SOL;
  }

  /**
   * Get airdrop statistics
   */
  async getStats() {
    const [airdropState] = await this.getAirdropStatePDA();
    
    try {
      const state = await this.program.account.airdropState.fetch(airdropState);
      
      return {
        totalAirdropped: state.totalAirdropped.toNumber() / LAMPORTS_PER_SOL,
        totalAirdrops: state.totalAirdrops.toNumber(),
        owner: state.owner.toString(),
      };
    } catch (error) {
      // If account doesn't exist, return default values
      return {
        totalAirdropped: 0,
        totalAirdrops: 0,
        owner: ''
      };
    }
  }

  /**
   * Get amount received by a specific recipient
   */
  async getRecipientAmount(recipient) {
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
  subscribeToAirdropEvents(callback) {
    return this.program.addEventListener('AirdropBatchEvent', callback);
  }

  /**
   * Remove event listener
   */
  unsubscribeFromAirdropEvents(listenerId) {
    this.program.removeEventListener(listenerId);
  }
}