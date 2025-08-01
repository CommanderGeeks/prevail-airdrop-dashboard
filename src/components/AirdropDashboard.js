import React, { useState, useEffect, useMemo } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Shield, Zap, Send, Users, DollarSign, Activity, AlertCircle, CheckCircle } from 'lucide-react';
import { AirdropSDK } from '../utils/airdrop-sdk';
import './AirdropDashboard.css';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import './WalletButton.css';

const AirdropDashboard = () => {
  const wallet = useWallet();
  const { connection } = useConnection();
  const [recipients, setRecipients] = useState('');
  const [amounts, setAmounts] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [adminBalance, setAdminBalance] = useState(0);
  const [stats, setStats] = useState({ totalAirdropped: 0, totalAirdrops: 0 });
  const [recentAirdrops, setRecentAirdrops] = useState([]);
  const [notification, setNotification] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const WalletConnectButton = () => {
  const { wallet, connect, disconnect, connecting, connected, publicKey } = useWallet();

  const handleClick = async () => {
    try {
      if (!connected && wallet) {
        await connect();
      } else if (!wallet) {
        // If no wallet is selected, the multi button will handle showing the modal
        console.log('No wallet selected, showing wallet modal...');
      }
    } catch (error) {
      console.error('Wallet connection error:', error);
    }
  };

  // Use the built-in WalletMultiButton which handles the modal properly
  return (
    <div className="wallet-adapter-button-wrapper">
      <WalletMultiButton className="wallet-adapter-button" />
    </div>
  );
};

export default WalletConnectButton;

  // Create SDK instance
  const sdk = useMemo(() => {
    if (wallet.connected && connection) {
      return new AirdropSDK(connection, wallet);
    }
    return null;
  }, [wallet.connected, connection]);

  // Load stats when wallet connects
  useEffect(() => {
    if (sdk) {
      loadStats();
      loadBalance();
    }
  }, [sdk]);

  const loadStats = async () => {
    if (!sdk) return;
    try {
      const currentStats = await sdk.getStats();
      setStats(currentStats);
      setIsInitialized(true); // If we can get stats, program is initialized
    } catch (error) {
      console.error('Failed to load stats:', error);
      setIsInitialized(false);
    }
  };

  const loadBalance = async () => {
    if (!wallet.publicKey || !connection) return;
    try {
      const balance = await connection.getBalance(wallet.publicKey);
      setAdminBalance(balance / LAMPORTS_PER_SOL);
    } catch (error) {
      console.error('Failed to load balance:', error);
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const initializeProgram = async () => {
    if (!sdk) return;
    
    try {
      setIsProcessing(true);
      await sdk.initialize();
      setIsInitialized(true);
      showNotification('Program initialized successfully!');
    } catch (error) {
      showNotification('Failed to initialize program: ' + error.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  const calculateTotal = () => {
    const amountArray = amounts.split('\n').filter(a => a.trim());
    return amountArray.reduce((sum, amount) => {
      const parsed = parseFloat(amount) || 0;
      return sum + parsed;
    }, 0);
  };

  const validateInputs = () => {
    const recipientArray = recipients.split('\n').filter(r => r.trim());
    const amountArray = amounts.split('\n').filter(a => a.trim());
    
    if (recipientArray.length === 0) {
      showNotification('Please enter at least one recipient', 'error');
      return false;
    }
    
    if (recipientArray.length !== amountArray.length) {
      showNotification('Number of recipients must match number of amounts', 'error');
      return false;
    }
    
    // Validate addresses (basic check)
    for (const recipient of recipientArray) {
      if (recipient.length < 32 || recipient.length > 44) {
        showNotification(`Invalid address: ${recipient}`, 'error');
        return false;
      }
    }
    
    // Validate amounts
    for (const amount of amountArray) {
      const parsed = parseFloat(amount);
      if (isNaN(parsed) || parsed <= 0) {
        showNotification(`Invalid amount: ${amount}`, 'error');
        return false;
      }
    }
    
    const total = calculateTotal();
    if (total > adminBalance) {
      showNotification(`Insufficient balance. Need ${total} SOL but have ${adminBalance} SOL`, 'error');
      return false;
    }
    
    return true;
  };

  const processAirdrop = async () => {
    if (!sdk || !validateInputs()) return;
    
    setIsProcessing(true);
    
    try {
      const recipientArray = recipients.split('\n').filter(r => r.trim());
      const amountArray = amounts.split('\n').filter(a => a.trim()).map(a => parseFloat(a));
      
      const txId = await sdk.executeAirdrop(recipientArray, amountArray);
      
      const total = calculateTotal();
      
      // Update recent airdrops
      setRecentAirdrops(prev => [{
        id: Date.now(),
        txId,
        recipients: recipientArray.length,
        totalAmount: total,
        timestamp: new Date().toLocaleString(),
        status: 'completed'
      }, ...prev].slice(0, 5));
      
      // Clear inputs
      setRecipients('');
      setAmounts('');
      
      // Reload stats
      await loadStats();
      await loadBalance();
      
      showNotification(`Airdrop successful! Transaction: ${txId.substring(0, 8)}...`);
    } catch (error) {
      showNotification('Airdrop failed: ' + error.message, 'error');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center space-x-2 ${
          notification.type === 'error' ? 'bg-red-900 text-red-100' : 'bg-green-900 text-green-100'
        }`}>
          {notification.type === 'error' ? (
            <AlertCircle className="w-5 h-5" />
          ) : (
            <CheckCircle className="w-5 h-5" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-b from-gray-900 to-black p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-5xl font-bold mb-4">PREVAIL Airdrop Admin</h1>
              <p className="text-gray-400 text-xl">Distribute SOL tokens to multiple recipients efficiently</p>
            </div>
            {wallet.connected && (
              <div className="text-right">
                <p className="text-gray-400 text-sm">Connected Wallet</p>
                <p className="text-green-400 font-mono">{wallet.publicKey?.toString().substring(0, 8)}...{wallet.publicKey?.toString().substring(36)}</p>
                <button
                  onClick={wallet.disconnect}
                  className="text-red-400 hover:text-red-300 text-sm mt-2"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-6xl mx-auto p-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-gradient-to-br from-green-900/20 to-green-800/10 border border-green-800/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Total Airdropped</span>
              <DollarSign className="w-5 h-5 text-green-400" />
            </div>
            <p className="text-3xl font-bold text-green-400">{stats.totalAirdropped.toFixed(2)} SOL</p>
          </div>
          <div className="bg-gradient-to-br from-blue-900/20 to-blue-800/10 border border-blue-800/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Total Airdrops</span>
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <p className="text-3xl font-bold text-blue-400">{stats.totalAirdrops}</p>
          </div>
          <div className="bg-gradient-to-br from-purple-900/20 to-purple-800/10 border border-purple-800/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400">Admin Balance</span>
              <Activity className="w-5 h-5 text-purple-400" />
            </div>
            <p className="text-3xl font-bold text-purple-400">{adminBalance.toFixed(2)} SOL</p>
          </div>
        </div>

        {/* Main Content */}
        {!wallet.connected ? (
          <div className="text-center">
            <button
              onClick={wallet.connect}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold py-4 px-8 rounded-lg text-lg transition-all transform hover:scale-105"
            >
              Connect Admin Wallet
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Airdrop Form */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-8">
              <h2 className="text-2xl font-bold mb-6 flex items-center">
                <Send className="mr-3 text-green-400" />
                Create Airdrop
              </h2>
              
              {!isInitialized && (
                <div className="mb-6 p-4 bg-yellow-900/20 border border-yellow-800/30 rounded-lg">
                  <p className="text-yellow-400 mb-3">Program needs to be initialized first</p>
                  <button
                    onClick={initializeProgram}
                    disabled={isProcessing}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded transition-colors"
                  >
                    Initialize Program
                  </button>
                </div>
              )}
              
              <div className="mb-6">
                <label className="block text-gray-400 mb-2">Recipient Addresses</label>
                <textarea
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                  placeholder="Enter Solana wallet addresses (one per line)...&#10;7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU&#10;9WzDnYfhBz3Dv3YiPEZJCcUyBm8vUVPvKKBSUMEPvLea&#10;..."
                  className="w-full h-32 bg-black border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 focus:border-green-400 focus:outline-none font-mono text-sm"
                />
              </div>

              <div className="mb-6">
                <label className="block text-gray-400 mb-2">Amounts (SOL)</label>
                <textarea
                  value={amounts}
                  onChange={(e) => setAmounts(e.target.value)}
                  placeholder="Enter amounts in SOL (one per line)...&#10;1.5&#10;2.0&#10;..."
                  className="w-full h-32 bg-black border border-gray-700 rounded-lg p-4 text-white placeholder-gray-500 focus:border-green-400 focus:outline-none font-mono text-sm"
                />
              </div>

              <div className="mb-6 p-4 bg-green-900/20 border border-green-800/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-green-400">Total Required</span>
                  <span className="text-2xl font-bold text-green-400">{calculateTotal().toFixed(2)} SOL</span>
                </div>
              </div>

              <button
                onClick={processAirdrop}
                disabled={isProcessing || !recipients || !amounts}
                className={`w-full py-4 rounded-lg font-bold text-lg transition-all transform ${
                  isProcessing || !recipients || !amounts
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 text-white hover:scale-105'
                }`}
              >
                {isProcessing ? (
                  <span className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                    Processing Airdrop...
                  </span>
                ) : (
                  <span className="flex items-center justify-center">
                    <Send className="mr-2" />
                    Execute Airdrop
                  </span>
                )}
              </button>
            </div>

            {/* Recent Airdrops */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-8">
              <h2 className="text-2xl font-bold mb-6 flex items-center">
                <Activity className="mr-3 text-blue-400" />
                Recent Airdrops
              </h2>
              
              {recentAirdrops.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No airdrops yet</p>
              ) : (
                <div className="space-y-4">
                  {recentAirdrops.map((airdrop) => (
                    <div key={airdrop.id} className="bg-black border border-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-green-400 font-semibold">{airdrop.totalAmount.toFixed(2)} SOL</span>
                        <span className="text-xs text-gray-500">{airdrop.timestamp}</span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400">{airdrop.recipients} recipients</span>
                        <span className="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded">
                          {airdrop.status}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 font-mono">
                        TX: {airdrop.txId.substring(0, 20)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AirdropDashboard;