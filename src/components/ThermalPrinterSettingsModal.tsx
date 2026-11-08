import React, { useState, useEffect } from 'react';
import {
  Printer,
  Bluetooth,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Sliders,
  Cpu,
  HelpCircle,
  X,
  Zap,
  Radio
} from 'lucide-react';
import {
  isWebBluetoothAvailable,
  isWebSerialAvailable,
  isAppInIframe,
  detectAndConnectBTPrinter,
  detectAndConnectSerialPrinter,
  disconnectBTPrinter,
  getPrinterEmulation,
  setPrinterEmulation,
  printReceiptUniversal,
  printViaRawBt,
  generateEscPosCommands,
  generateCpclCommands,
  sendToBluetoothPrinter,
  sendToSerialPrinter,
  ConnectedBTPrinter,
  PrinterEmulation,
  TicketPrintData
} from '../utils/bluetoothPrinter';

interface ThermalPrinterSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectedPrinter: ConnectedBTPrinter | null;
  agentName?: string;
  agentUid?: string;
  workspaceName?: string;
  location?: string;
}

export const ThermalPrinterSettingsModal: React.FC<ThermalPrinterSettingsModalProps> = ({
  isOpen,
  onClose,
  connectedPrinter,
  agentName = 'Field Agent',
  agentUid,
  workspaceName = 'VakZim ICT&E',
  location = 'Harare CBD'
}) => {
  const [emulation, setEmulationState] = useState<PrinterEmulation>(getPrinterEmulation());
  const [activeTab, setActiveTab] = useState<'status' | 'connect' | 'sewoo_guide'>('status');
  const [testingStatus, setTestingStatus] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [connectingType, setConnectingType] = useState<'ble' | 'serial' | null>(null);
  const inIframe = isAppInIframe();

  useEffect(() => {
    setEmulationState(getPrinterEmulation());
  }, [isOpen]);

  if (!isOpen) return null;

  const handleEmulationChange = (newEmulation: PrinterEmulation) => {
    setEmulationState(newEmulation);
    setPrinterEmulation(newEmulation);
    setTestResult({
      success: true,
      message: `Emulation updated to ${newEmulation === 'escpos' ? 'ESC/POS (Standard)' : 'CPCL (Sewoo LK-P / Zebra)'}.`
    });
    setTimeout(() => setTestResult(null), 3500);
  };

  const getSampleTestData = (customCode = 'POS-TEST-88'): TicketPrintData => ({
    code: customCode,
    plan: '5GB Daily Superfast',
    price: 3.50,
    originalPrice: 4.00,
    discountApplied: 0.50,
    duration: '24 Hours',
    customerName: 'Thermal POS Test',
    customerCell: '+263 77 123 4567',
    customerNumber: 'CUST-0092',
    networkName: 'WiVoTe-HighSpeed',
    workspaceName,
    agentName,
    agentId: agentUid,
    location,
    dateFormatted: new Date().toLocaleString(),
    loyaltyNotice: 'Silver Tier Voucher'
  });

  const handleRunTestPrint = async (forcedEmulation?: PrinterEmulation) => {
    const activeEmul = forcedEmulation || emulation;
    setTestingStatus(`Printing test slip using ${activeEmul.toUpperCase()}...`);
    setTestResult(null);

    const testData = getSampleTestData(`TEST-${activeEmul.toUpperCase()}`);

    try {
      if (connectedPrinter?.isConnected) {
        const payload = activeEmul === 'cpcl' ? generateCpclCommands(testData) : generateEscPosCommands(testData);

        if (connectedPrinter.connectionType === 'bluetooth_ble' && connectedPrinter.characteristic) {
          await sendToBluetoothPrinter(connectedPrinter.characteristic, payload);
          setTestResult({
            success: true,
            message: `✓ Test slip successfully sent to ${connectedPrinter.name} via Bluetooth BLE (${activeEmul.toUpperCase()})!`
          });
        } else if (connectedPrinter.connectionType === 'serial_spp' && connectedPrinter.serialPort) {
          await sendToSerialPrinter(connectedPrinter.serialPort, payload);
          setTestResult({
            success: true,
            message: `✓ Test slip transmitted to Serial Port (${activeEmul.toUpperCase()})!`
          });
        } else {
          // Fallback universal
          const res = await printReceiptUniversal(testData);
          setTestResult({
            success: true,
            message: res.method === 'bluetooth' ? `✓ Sent to ${res.printerName}!` : '✓ Thermal print preview opened!'
          });
        }
      } else {
        // Fallback to thermal window
        await printReceiptUniversal(testData);
        setTestResult({
          success: true,
          message: '✓ Thermal slip preview opened (no hardware printer connected).'
        });
      }
    } catch (err: any) {
      console.error('Test print failed:', err);
      setTestResult({
        success: false,
        message: `Print error: ${err.message || 'Transmission failed. Check printer battery & mode.'}`
      });
    } finally {
      setTestingStatus(null);
    }
  };

  const handleConnectBLE = async () => {
    setConnectingType('ble');
    setTestResult(null);
    try {
      const res = await detectAndConnectBTPrinter();
      if (res.success) {
        setTestResult({
          success: true,
          message: `✓ Connected to ${res.printerName}! Ready for instant printing.`
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Could not connect to Bluetooth printer.'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection error'
      });
    } finally {
      setConnectingType(null);
    }
  };

  const handleConnectSerial = async () => {
    setConnectingType('serial');
    setTestResult(null);
    try {
      const res = await detectAndConnectSerialPrinter(115200);
      if (res.success) {
        setTestResult({
          success: true,
          message: `✓ Connected to ${res.printerName}! (Web Serial / SPP mode)`
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Could not connect via Web Serial.'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Serial connection error'
      });
    } finally {
      setConnectingType(null);
    }
  };

  const handleDisconnect = async () => {
    await disconnectBTPrinter();
    setTestResult({
      success: true,
      message: 'Printer disconnected.'
    });
  };

  const handleRawBtTest = () => {
    const testData = getSampleTestData('RAWBT-TEST');
    const sent = printViaRawBt(testData);
    if (sent) {
      setTestResult({
        success: true,
        message: '✓ Transmitted to Android RawBT Print Service!'
      });
    } else {
      setTestResult({
        success: false,
        message: 'Could not trigger RawBT. Ensure the RawBT app is installed on your Android device.'
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden text-slate-800 dark:text-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-600/10 dark:bg-sky-400/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-display">Thermal Slip & Sewoo BT Manager</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sewoo LK-P21B, POS-58/80, BLE GATT & Serial SPP configuration
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Iframe warning if detected */}
        {inIframe && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>
                <strong>Browser Restriction:</strong> Web Bluetooth requires a direct top-level tab. Open the app in a full browser tab to scan Bluetooth devices.
              </span>
            </div>
            <button
              type="button"
              onClick={() => window.open(window.location.href, '_blank')}
              className="inline-flex items-center gap-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded-lg transition cursor-pointer shadow-xs"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in New Tab
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-6 bg-slate-50/50 dark:bg-slate-900/50 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('status')}
            className={`py-3 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'status'
                ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            Printer Status & Emulation
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('connect')}
            className={`py-3 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'connect'
                ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Bluetooth className="w-3.5 h-3.5" />
            Connection Options
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sewoo_guide')}
            className={`py-3 text-xs font-bold border-b-2 transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'sewoo_guide'
                ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Sewoo LK-P21B Setup Guide
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 text-sm flex-1">
          
          {/* Feedback banner */}
          {testResult && (
            <div
              className={`p-3.5 rounded-2xl flex items-start gap-2.5 text-xs font-mono animate-in fade-in duration-150 whitespace-pre-line ${
                testResult.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              )}
              <span className="flex-1 whitespace-pre-line">{testResult.message}</span>
            </div>
          )}

          {activeTab === 'status' && (
            <div className="space-y-6">
              {/* Current Connection Status Card */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    connectedPrinter?.isConnected
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                  }`}>
                    <Bluetooth className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">
                        {connectedPrinter?.isConnected ? connectedPrinter.name : 'No Hardware Printer Connected'}
                      </span>
                      {connectedPrinter?.isConnected && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                          {connectedPrinter.connectionType === 'bluetooth_ble' ? 'BLE GATT' : 'Serial SPP'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {connectedPrinter?.isConnected
                        ? 'Hardware print channel ready for instant voucher slips.'
                        : 'Using high-contrast 58mm thermal print dialog as default.'}
                    </p>
                  </div>
                </div>

                {connectedPrinter?.isConnected ? (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900 transition cursor-pointer"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleConnectBLE}
                    disabled={connectingType !== null}
                    className="px-3.5 py-1.5 text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <Bluetooth className="w-3.5 h-3.5" />
                    {connectingType === 'ble' ? 'Scanning...' : 'Detect BT Printer'}
                  </button>
                )}
              </div>

              {/* Emulation Selection: ESC/POS vs CPCL */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" />
                    Printer Command Emulation
                  </label>
                  <span className="text-[11px] text-slate-400">
                    Active: <strong className="text-sky-600 dark:text-sky-400 uppercase">{emulation}</strong>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* ESC/POS option */}
                  <div
                    onClick={() => handleEmulationChange('escpos')}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      emulation === 'escpos'
                        ? 'border-sky-600 bg-sky-50/50 dark:bg-sky-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        ESC/POS Mode
                        {emulation === 'escpos' && <CheckCircle2 className="w-4 h-4 text-sky-600" />}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        Default
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Standard industry protocol for POS-58, POS-80, and Sewoo LK-P21 when running in Standard Receipt firmware mode.
                    </p>
                  </div>

                  {/* CPCL option */}
                  <div
                    onClick={() => handleEmulationChange('cpcl')}
                    className={`p-3.5 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                      emulation === 'cpcl'
                        ? 'border-sky-600 bg-sky-50/50 dark:bg-sky-950/30'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                        CPCL Mode (Sewoo / Zebra)
                        {emulation === 'cpcl' && <CheckCircle2 className="w-4 h-4 text-sky-600" />}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300">
                        Sewoo Native
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Native format for Sewoo LK-P mobile printers configured in CPCL emulation mode. Switch to this if ESC/POS produces no output.
                    </p>
                  </div>
                </div>
              </div>

              {/* Diagnostic Test Buttons */}
              <div className="space-y-3 pt-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5" />
                  Diagnostic Test Prints
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleRunTestPrint('escpos')}
                    disabled={testingStatus !== null}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-700/60 font-mono text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer text-center"
                  >
                    <Printer className="w-4 h-4 text-sky-600" />
                    <span>Test ESC/POS</span>
                    <span className="text-[10px] font-normal text-slate-400">Standard binary stream</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRunTestPrint('cpcl')}
                    disabled={testingStatus !== null}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-700/60 font-mono text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer text-center"
                  >
                    <Cpu className="w-4 h-4 text-amber-500" />
                    <span>Test CPCL</span>
                    <span className="text-[10px] font-normal text-slate-400">Sewoo mobile command</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => printReceiptUniversal(getSampleTestData('WINDOW-TEST'))}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 hover:bg-slate-50 dark:hover:bg-slate-700/60 font-mono text-xs font-bold flex flex-col items-center gap-1.5 transition cursor-pointer text-center"
                  >
                    <ExternalLink className="w-4 h-4 text-emerald-500" />
                    <span>Test 58mm Window</span>
                    <span className="text-[10px] font-normal text-slate-400">Browser thermal slip</span>
                  </button>
                </div>
                {testingStatus && (
                  <p className="text-xs text-sky-600 dark:text-sky-400 font-mono animate-pulse">
                    {testingStatus}
                  </p>
                )}
              </div>

            </div>
          )}

          {activeTab === 'connect' && (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Choose how your Sewoo LK-P21B, POS-58, POS-80, or mobile thermal printer connects directly to WiVoTe:
              </p>

              {/* Option 1: WiVoTe Native Direct BT Integrator (App-Free Direct Connection) */}
              <div className="p-4 rounded-2xl border-2 border-sky-500/40 bg-sky-50/50 dark:bg-sky-950/20 space-y-3 relative overflow-hidden shadow-xs">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      WiVoTe Native Direct BT Integrator
                    </span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white shadow-xs">
                    ✨ Recommended (No RawBT App Needed)
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Connects directly to your Bluetooth thermal printer (Sewoo LK-P21B, POS-58, POS-80, GOOJPRT, Xprinter, Zjiang, Bixolon, etc.) right inside WiVoTe. Converts receipts directly to binary ESC/POS or CPCL commands without requiring RawBT or any 3rd-party app!
                </p>

                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <button
                    type="button"
                    onClick={handleConnectBLE}
                    disabled={!isWebBluetoothAvailable() || connectingType !== null}
                    className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${connectingType === 'ble' ? 'animate-spin' : ''}`} />
                    {connectingType === 'ble' ? 'Detecting Printer...' : 'Scan & Pair Native BT Printer'}
                  </button>

                  {inIframe && (
                    <button
                      type="button"
                      onClick={() => window.open(window.location.href, '_blank')}
                      className="px-3 py-2 text-xs font-bold border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40 rounded-xl transition cursor-pointer flex items-center gap-1.5"
                      title="Opens WiVoTe in a top-level tab to grant full Web Bluetooth permissions on Chrome/Android"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Launch Direct BT Popup Window
                    </button>
                  )}
                </div>
              </div>

              {/* Option 2: Web Serial / Classic Bluetooth SPP */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-amber-500" />
                    <span className="font-bold text-sm">Bluetooth Serial SPP (COM Port) or USB</span>
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                    isWebSerialAvailable()
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                  }`}>
                    {isWebSerialAvailable() ? 'Web Serial Ready' : 'Chrome/Edge Only'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Connects to Classic Bluetooth Serial Port Profile (SPP / COM ports) or USB thermal printer cables directly without GATT services.
                </p>
                <button
                  type="button"
                  onClick={handleConnectSerial}
                  disabled={!isWebSerialAvailable() || connectingType !== null}
                  className="px-3.5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  {connectingType === 'serial' ? 'Connecting...' : 'Connect via Serial SPP / COM'}
                </button>
              </div>

              {/* Option 3: Legacy Android RawBT Relay */}
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 opacity-80 hover:opacity-100 transition">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className="w-4 h-4 text-slate-500" />
                    <span className="font-bold text-sm">Android RawBT App Relay (Optional Fallback)</span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    Legacy Helper
                  </span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Optional helper for Android devices that already have the RawBT app installed and paired in Android Bluetooth Settings.
                </p>
                <button
                  type="button"
                  onClick={handleRawBtTest}
                  className="px-3.5 py-2 text-xs font-bold bg-slate-700 hover:bg-slate-800 text-white rounded-xl transition cursor-pointer flex items-center gap-1.5 shadow-xs"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Test Print via RawBT App
                </button>
              </div>
            </div>
          )}

          {activeTab === 'sewoo_guide' && (
            <div className="space-y-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <div className="p-4 rounded-2xl bg-sky-50/60 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 space-y-2">
                <h4 className="font-bold text-sky-900 dark:text-sky-200 text-sm flex items-center gap-2">
                  <HelpCircle className="w-4 h-4" />
                  Sewoo LK-P21B Hardware Verification Steps
                </h4>
                <p>
                  Follow these 3 quick checks to ensure your Sewoo LK-P21B prints properly on every voucher sale:
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <h5 className="font-bold text-slate-900 dark:text-white mb-1">
                    Step 1: Check Printer Emulation Mode (Self-Test Slip)
                  </h5>
                  <ol className="list-decimal list-inside space-y-1 text-slate-500 dark:text-slate-400 pl-1">
                    <li>Turn OFF the printer.</li>
                    <li>Press and HOLD the <strong>FEED</strong> button.</li>
                    <li>While holding FEED, press the <strong>POWER</strong> button until the printer beeps.</li>
                    <li>Release both buttons. The printer will print its self-test configuration slip.</li>
                    <li>
                      Look for the <strong>Emulation</strong> line: it will say either <strong>ESC/POS</strong> or <strong>CPCL</strong>.
                    </li>
                    <li>
                      Match this setting in the <strong>Printer Status & Emulation</strong> tab above!
                    </li>
                  </ol>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <h5 className="font-bold text-slate-900 dark:text-white mb-1">
                    Step 2: Bluetooth Pairing in OS
                  </h5>
                  <p className="text-slate-500 dark:text-slate-400">
                    Pair the Sewoo LK-P21B in your phone or PC Bluetooth settings (Default PIN is usually <code>0000</code> or <code>1234</code>).
                    The LED will turn solid blue or green once connected.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <h5 className="font-bold text-slate-900 dark:text-white mb-1">
                    Step 3: Open in Full Browser Tab
                  </h5>
                  <p className="text-slate-500 dark:text-slate-400">
                    If viewing this terminal inside an iframe preview, click <strong>Open in New Tab</strong> at the top.
                    Modern web browsers require top-level window security to communicate with Bluetooth devices.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            58mm Thermal Print Engine · 20-Byte BLE MTU Safe
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold bg-slate-800 dark:bg-slate-200 hover:bg-slate-700 dark:hover:bg-white text-white dark:text-slate-900 rounded-xl transition cursor-pointer shadow-xs"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
