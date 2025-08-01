// lib.rs - Main program file
use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("Airdrop11111111111111111111111111111111111");

#[program]
pub mod airdrop_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let airdrop_state = &mut ctx.accounts.airdrop_state;
        airdrop_state.owner = ctx.accounts.owner.key();
        airdrop_state.total_airdropped = 0;
        airdrop_state.total_airdrops = 0;
        Ok(())
    }

    pub fn airdrop(
        ctx: Context<Airdrop>,
        recipients: Vec<Pubkey>,
        amounts: Vec<u64>, // amounts in lamports
    ) -> Result<()> {
        // Verify arrays have same length
        require!(
            recipients.len() == amounts.len(),
            AirdropError::ArrayLengthMismatch
        );
        require!(recipients.len() > 0, AirdropError::NoRecipients);

        // Verify owner
        require!(
            ctx.accounts.owner.key() == ctx.accounts.airdrop_state.owner,
            AirdropError::Unauthorized
        );

        let total_amount: u64 = amounts.iter().sum();
        
        // Verify sufficient balance
        require!(
            ctx.accounts.owner.lamports() >= total_amount,
            AirdropError::InsufficientFunds
        );

        // Process each airdrop
        for (i, recipient) in recipients.iter().enumerate() {
            let amount = amounts[i];
            
            // Transfer SOL from owner to recipient
            let cpi_context = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.owner.to_account_info(),
                    to: ctx.accounts.recipient_loader.to_account_info(),
                },
            );
            
            system_program::transfer(cpi_context, amount)?;
            
            // Update recipient tracking
            if let Some(recipient_data) = ctx.accounts.recipient_data.as_mut() {
                if recipient_data.recipient == *recipient {
                    recipient_data.amount_received += amount;
                } else {
                    // Initialize new recipient data
                    recipient_data.recipient = *recipient;
                    recipient_data.amount_received = amount;
                }
            }
        }

        // Update state
        let airdrop_state = &mut ctx.accounts.airdrop_state;
        airdrop_state.total_airdropped += total_amount;
        airdrop_state.total_airdrops += 1;

        // Emit event
        emit!(AirdropBatchEvent {
            total_recipients: recipients.len() as u32,
            total_amount,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn get_total_airdropped(ctx: Context<GetStats>) -> Result<u64> {
        Ok(ctx.accounts.airdrop_state.total_airdropped)
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + 32 + 8 + 8,
        seeds = [b"airdrop_state"],
        bump
    )]
    pub airdrop_state: Account<'info, AirdropState>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Airdrop<'info> {
    #[account(mut, seeds = [b"airdrop_state"], bump)]
    pub airdrop_state: Account<'info, AirdropState>,
    #[account(mut)]
    pub owner: Signer<'info>,
    /// CHECK: This account is used dynamically for recipients
    pub recipient_loader: AccountInfo<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + 32 + 8,
        seeds = [b"recipient_data", recipient_loader.key().as_ref()],
        bump
    )]
    pub recipient_data: Option<Account<'info, RecipientData>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct GetStats<'info> {
    #[account(seeds = [b"airdrop_state"], bump)]
    pub airdrop_state: Account<'info, AirdropState>,
}

#[account]
pub struct AirdropState {
    pub owner: Pubkey,
    pub total_airdropped: u64,
    pub total_airdrops: u64,
}

#[account]
pub struct RecipientData {
    pub recipient: Pubkey,
    pub amount_received: u64,
}

#[event]
pub struct AirdropBatchEvent {
    pub total_recipients: u32,
    pub total_amount: u64,
    pub timestamp: i64,
}

#[error_code]
pub enum AirdropError {
    #[msg("Arrays must have the same length")]
    ArrayLengthMismatch,
    #[msg("No recipients provided")]
    NoRecipients,
    #[msg("Only owner can call this function")]
    Unauthorized,
    #[msg("Insufficient funds for airdrop")]
    InsufficientFunds,
}

// ===== Cargo.toml =====
/*
[package]
name = "airdrop-program"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name = "airdrop_program"

[features]
no-entrypoint = []
no-idl = []
no-log-ix-name = []
cpi = ["no-entrypoint"]
default = []

[dependencies]
anchor-lang = "0.29.0"

[dev-dependencies]
anchor-client = "0.29.0"
solana-program-test = "1.17.0"
solana-sdk = "1.17.0"
*/

// ===== Tests (tests/airdrop.ts) =====
/*
import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AirdropProgram } from "../target/types/airdrop_program";
import { assert } from "chai";

describe("airdrop-program", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.AirdropProgram as Program<AirdropProgram>;
  
  let airdropState: anchor.web3.PublicKey;

  it("Initializes the program", async () => {
    [airdropState] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("airdrop_state")],
      program.programId
    );

    await program.methods
      .initialize()
      .accounts({
        airdropState,
        owner: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.airdropState.fetch(airdropState);
    assert.equal(state.owner.toString(), provider.wallet.publicKey.toString());
    assert.equal(state.totalAirdropped.toNumber(), 0);
  });

  it("Performs an airdrop", async () => {
    const recipients = [
      anchor.web3.Keypair.generate().publicKey,
      anchor.web3.Keypair.generate().publicKey,
      anchor.web3.Keypair.generate().publicKey,
    ];
    
    const amounts = [
      new anchor.BN(1_000_000_000), // 1 SOL
      new anchor.BN(2_000_000_000), // 2 SOL
      new anchor.BN(1_500_000_000), // 1.5 SOL
    ];

    await program.methods
      .airdrop(recipients, amounts)
      .accounts({
        airdropState,
        owner: provider.wallet.publicKey,
        recipientLoader: recipients[0], // This would be dynamically loaded
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const state = await program.account.airdropState.fetch(airdropState);
    assert.equal(state.totalAirdropped.toNumber(), 4_500_000_000);
    assert.equal(state.totalAirdrops.toNumber(), 1);
  });
});
*/