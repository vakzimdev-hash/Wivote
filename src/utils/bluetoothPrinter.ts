// Utility module for Bluetooth Thermal Receipt Printing (58mm / 80mm ESC/POS and Sewoo CPCL)
// Full support for Sewoo LK-P21B, POS-58, POS-80, ISSC, Woosim, Web Bluetooth BLE & Web Serial SPP

export interface TicketPrintData {
  code: string;
  plan: string;
  price: number;
  originalPrice?: number;
  discountApplied?: number;
  duration: string;
  customerName: string;
  customerCell: string;
  customerNumber?: string;
  loyaltyNotice?: string;
  networkName?: string;
  workspaceName?: string;
  agentName: string;
  agentId?: string;
  dateFormatted?: string;
  location?: string;
}

export type PrinterEmulation = 'escpos' | 'cpcl';
export type PrinterConnectionType = 'bluetooth_ble' | 'serial_spp' | 'rawbt' | 'thermal_window';

// Comprehensive Bluetooth Low Energy (BLE) GATT Primary Services for POS / Thermal Printers
// Note: All services in optionalServices MUST be valid 128-bit UUID strings or standard registered aliases
export const THERMAL_PRINTER_SERVICES: string[] = [
  // 1. Sewoo & ISSC Transparent UART Service (Widely used by Sewoo LK-P21/LK-P21B/LK-P30 mobile printers)
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '00004953-0000-1000-8000-00805f9b34fb',

  // 2. Woosim / Sewoo Custom BLE Services (ae30, ae00, ae01, ae10, ae11, ae20)
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000ae01-0000-1000-8000-00805f9b34fb',
  '0000ae10-0000-1000-8000-00805f9b34fb',
  '0000ae11-0000-1000-8000-00805f9b34fb',
  '0000ae20-0000-1000-8000-00805f9b34fb',

  // 3. Sewoo / Bluegiga / Lukhan Custom BLE Service
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',

  // 4. Microchip IS1678 / BM70 / BM77 BLE Transparent UART (found on Sewoo LK-P series Bluetooth boards)
  '00035b03-58e6-07dd-021a-08123a000300',

  // 5. Ubiquitous HM-10 / POS-58 / POS-80 / Zijiang / Milestone / Netum / Xprinter BLE UART Service
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  // Alternative HM-10 / FFE1 BLE Write/UART Service
  '0000ffe1-0000-1000-8000-00805f9b34fb',

  // 6. Generic ESC/POS thermal printer services (ff00, ff01, ff02, ffb0, ff80)
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ff01-0000-1000-8000-00805f9b34fb',
  '0000ff02-0000-1000-8000-00805f9b34fb',
  '0000ff80-0000-1000-8000-00805f9b34fb',
  '0000ffb0-0000-1000-8000-00805f9b34fb',

  // 7. Standard Bluetooth POS Printer Service (18f0, 18f1, 18f2)
  '000018f0-0000-1000-8000-00805f9b34fb',
  '000018f1-0000-1000-8000-00805f9b34fb',
  '000018f2-0000-1000-8000-00805f9b34fb',

  // 8. Nordic Semiconductor UART Service (NUS)
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',

  // 9. Standard Serial Port Profile (SPP) / classic emulation (1101)
  '00001101-0000-1000-8000-00805f9b34fb',

  // 10. Dialog / Telink / Beken / Tencent / PeriPage / Goojprt POS (fee7, fee0, fef5, fef4)
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000fee0-0000-1000-8000-00805f9b34fb',
  '0000fef5-0000-1000-8000-00805f9b34fb',
  '0000fef4-0000-1000-8000-00805f9b34fb',
  '0000fe00-0000-1000-8000-00805f9b34fb',
  '0000fe01-0000-1000-8000-00805f9b34fb',
  '0000fe02-0000-1000-8000-00805f9b34fb',

  // 11. Custom serial/printer services (fff0, fff1, fff2, fff3)
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000fff1-0000-1000-8000-00805f9b34fb',
  '0000fff2-0000-1000-8000-00805f9b34fb',
  '0000fff3-0000-1000-8000-00805f9b34fb',

  // 12. Bixolon custom BLE service (b900)
  '0000b900-0000-1000-8000-00805f9b34fb',
  // 13. Woosim custom BLE service (f00d)
  '0000f00d-0000-1000-8000-00805f9b34fb',

  // 14. Zebra / Star / Munbyn / Phomemo BLE services
  '0000e70e-0000-1000-8000-00805f9b34fb',
  '00004001-0000-1000-8000-00805f9b34fb',
  '14839ac4-7d7e-415c-9a42-167340cf2339',
  '00003802-0000-1000-8000-00805f9b34fb',
  'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  '0000fe50-0000-1000-8000-00805f9b34fb',

  // 15. Generic Access & Device Info
  '00001800-0000-1000-8000-00805f9b34fb',
  '00001801-0000-1000-8000-00805f9b34fb',
  '0000180a-0000-1000-8000-00805f9b34fb'
];

// Explicit mapping of primary services to their known DATA/RX write characteristics
// This avoids accidentally writing to control/configuration points (e.g. ISSC 49535343-aca3-...)
const KNOWN_DATA_CHARACTERISTICS: Record<string, string[]> = {
  // ISSC Transparent UART (Sewoo LK-P21B): Data RX is 8841-43f4-a8d4-ecbe34729bb3
  '49535343-fe7d-4ae5-8fa9-9fafd205e455': [
    '49535343-8841-43f4-a8d4-ecbe34729bb3',
    '49535343-1e4d-4bd9-ba61-23c647249616'
  ],
  // HM-10: Write is ffe1
  '0000ffe0-0000-1000-8000-00805f9b34fb': ['0000ffe1-0000-1000-8000-00805f9b34fb'],
  // POS-58 / POS-80: Write is ff02
  '0000ff00-0000-1000-8000-00805f9b34fb': ['0000ff02-0000-1000-8000-00805f9b34fb'],
  // Woosim / Sewoo ae30: Write is ae01
  '0000ae30-0000-1000-8000-00805f9b34fb': ['0000ae01-0000-1000-8000-00805f9b34fb'],
  // Sewoo / Bluegiga e7810a71: Write is bef8d6c9-9c21-4c9e-b632-bd58c1009f9f
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2': ['bef8d6c9-9c21-4c9e-b632-bd58c1009f9f'],
  // Microchip BM70/BM77: Write is 00035b03-58e6-07dd-021a-08123a000301
  '00035b03-58e6-07dd-021a-08123a000300': ['00035b03-58e6-07dd-021a-08123a000301'],
  // Nordic NUS: Write is 6e400002-b5a3-f393-e0a9-e50e24dcca9e
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e': ['6e400002-b5a3-f393-e0a9-e50e24dcca9e'],
  // Standard POS: Write is 2af1
  '000018f0-0000-1000-8000-00805f9b34fb': ['00002af1-0000-1000-8000-00805f9b34fb']
};

// Known CONTROL characteristics to strictly EXCLUDE from receiving print payload
const EXCLUDED_CONTROL_CHARACTERISTICS = [
  '49535343-aca3-481c-91ec-d85e28a60318', // ISSC Control Point
  '00002a00-0000-1000-8000-00805f9b34fb', // Device Name
  '00002a01-0000-1000-8000-00805f9b34fb', // Appearance
  '00002a05-0000-1000-8000-00805f9b34fb'  // Service Changed
];

export interface ConnectedBTPrinter {
  id: string;
  name: string;
  device?: any;
  characteristic?: any;
  serialPort?: any;
  connectionType: 'bluetooth_ble' | 'serial_spp';
  isConnected: boolean;
}

// Persistent reference to active printer
let activePrinter: ConnectedBTPrinter | null = null;
let printerListeners: Array<(printer: ConnectedBTPrinter | null) => void> = [];

export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
}

export function isWebSerialAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function isAppInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch (e) {
    return true;
  }
}

/**
 * Gets currently configured printer emulation ('escpos' or 'cpcl')
 */
export function getPrinterEmulation(): PrinterEmulation {
  try {
    const saved = localStorage.getItem('wivote_printer_emulation');
    if (saved === 'cpcl' || saved === 'escpos') return saved;
  } catch (e) {
    // Ignore
  }
  return 'escpos';
}

/**
 * Sets printer emulation ('escpos' or 'cpcl')
 */
export function setPrinterEmulation(emulation: PrinterEmulation): void {
  try {
    localStorage.setItem('wivote_printer_emulation', emulation);
  } catch (e) {
    // Ignore
  }
}

export function subscribePrinterStatus(listener: (printer: ConnectedBTPrinter | null) => void): () => void {
  printerListeners.push(listener);
  listener(activePrinter);
  return () => {
    printerListeners = printerListeners.filter(l => l !== listener);
  };
}

function notifyPrinterChange() {
  printerListeners.forEach(listener => listener(activePrinter));
}

export function getActiveBTPrinter(): ConnectedBTPrinter | null {
  return activePrinter;
}

/**
 * Scan for previously paired or granted Bluetooth devices if supported by browser
 */
export async function getPairedBluetoothDevices(): Promise<Array<{ id: string; name: string }>> {
  if (!isWebBluetoothAvailable()) return [];
  try {
    const navAny = navigator as any;
    if (navAny.bluetooth && typeof navAny.bluetooth.getDevices === 'function') {
      const devices = await navAny.bluetooth.getDevices();
      return devices.map((d: any) => ({
        id: d.id || 'unknown',
        name: d.name || 'Paired Bluetooth Printer'
      }));
    }
  } catch (err) {
    console.warn('Could not query paired Bluetooth devices:', err);
  }
  return [];
}

/**
 * Connects to a Bluetooth device GATT server and discovers its true ESC/POS & CPCL writable characteristic.
 * Prioritizes Data RX characteristics over control points (vital for Sewoo LK-P21B).
 */
export async function connectDeviceGatt(device: any): Promise<{
  success: boolean;
  characteristic?: any;
  error?: string;
}> {
  try {
    if (!device.gatt) {
      return { success: false, error: 'Device does not support Bluetooth GATT.' };
    }

    const printerName = device.name || 'Bluetooth Thermal Printer';
    console.log(`[BT Printer] Connecting to GATT server for ${printerName}...`);

    let server: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (device.gatt.connected) {
          server = device.gatt;
          break;
        }
        server = await device.gatt.connect();
        if (server?.connected) break;
      } catch (connErr: any) {
        console.warn(`[BT Printer] GATT connection attempt ${attempt} failed:`, connErr);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 450));
        } else {
          throw connErr;
        }
      }
    }

    if (!server) {
      return {
        success: false,
        error: `Could not establish GATT connection with ${printerName}. If pairing or connection times out, please clear your native OS Bluetooth cache (unpair/forget device), toggle hardware Bluetooth OFF and ON, and retry.`
      };
    }

    // Give GATT server a moment to settle
    await new Promise(r => setTimeout(r, 250));

    let writeChar: any = null;

    // First try known thermal printer primary services
    for (const serviceUuid of THERMAL_PRINTER_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        if (!service) continue;
        const characteristics = await service.getCharacteristics();

        // 1. Check if this service has known data characteristics (e.g. ISSC 8841 on Sewoo LK-P21B)
        const knownDataUuids = KNOWN_DATA_CHARACTERISTICS[serviceUuid.toLowerCase()];
        if (knownDataUuids && knownDataUuids.length > 0) {
          for (const char of characteristics) {
            const charUuid = char.uuid.toLowerCase();
            if (knownDataUuids.includes(charUuid)) {
              const props = char.properties || {};
              if (props.writeWithoutResponse || props.write) {
                writeChar = char;
                console.log(`[BT Printer] Found designated DATA characteristic ${char.uuid} on service ${serviceUuid}`);
                break;
              }
            }
          }
        }

        // 2. If not found in known mapping, inspect all characteristics with priority for writeWithoutResponse
        if (!writeChar) {
          // Sort candidates: prefer writeWithoutResponse and exclude control points
          const candidates = characteristics.filter((char: any) => {
            const charUuid = char.uuid.toLowerCase();
            if (EXCLUDED_CONTROL_CHARACTERISTICS.includes(charUuid)) return false;
            const props = char.properties || {};
            return Boolean(props.writeWithoutResponse || props.write);
          });

          // Prefer writeWithoutResponse (data stream) over write-with-response (often control)
          const bestCandidate = candidates.find((c: any) => c.properties?.writeWithoutResponse) || candidates[0];
          if (bestCandidate) {
            writeChar = bestCandidate;
            console.log(`[BT Printer] Selected characteristic ${bestCandidate.uuid} on service ${serviceUuid}`);
          }
        }

        if (writeChar) break;
      } catch (err) {
        // Service not on this device, continue probing
      }
    }

    // Fallback: If not found in known list, scan all primary services
    if (!writeChar && typeof server.getPrimaryServices === 'function') {
      try {
        const allServices = await server.getPrimaryServices();
        for (const service of allServices) {
          try {
            const characteristics = await service.getCharacteristics();
            const candidates = characteristics.filter((char: any) => {
              const charUuid = char.uuid.toLowerCase();
              if (EXCLUDED_CONTROL_CHARACTERISTICS.includes(charUuid)) return false;
              const props = char.properties || {};
              return Boolean(props.writeWithoutResponse || props.write);
            });

            const bestCandidate = candidates.find((c: any) => c.properties?.writeWithoutResponse) || candidates[0];
            if (bestCandidate) {
              writeChar = bestCandidate;
              console.log(`[BT Printer] Discovered fallback write characteristic ${bestCandidate.uuid} on service ${service.uuid}`);
              break;
            }
          } catch (e) {
            // Ignore
          }
        }
      } catch (e) {
        console.warn('Could not enumerate all services:', e);
      }
    }

    if (!writeChar) {
      return {
        success: false,
        error: `Connected to ${printerName}, but could not establish a writable print channel. Ensure printer is powered ON and set to ESC/POS or CPCL mode.`
      };
    }

    return {
      success: true,
      characteristic: writeChar
    };
  } catch (err: any) {
    console.error('[BT Printer] GATT connect error:', err);
    return {
      success: false,
      error: `${err.message || 'Failed to connect to printer GATT server.'} Tip: You may need to clear your native device Bluetooth cache (unpair/forget device in OS Settings) or toggle hardware Bluetooth discovery OFF and ON before trying again.`
    };
  }
}

/**
 * Automatically reconnects to an active printer if connection was dropped
 */
export async function reconnectActivePrinter(): Promise<boolean> {
  if (activePrinter && activePrinter.connectionType === 'bluetooth_ble' && activePrinter.device) {
    const res = await connectDeviceGatt(activePrinter.device);
    if (res.success && res.characteristic) {
      activePrinter.characteristic = res.characteristic;
      activePrinter.isConnected = true;
      notifyPrinterChange();
      return true;
    }
  }
  return await autoConnectSavedPrinter();
}

/**
 * Attempts to automatically reconnect to a previously paired BLE printer from getDevices()
 */
export async function autoConnectSavedPrinter(): Promise<boolean> {
  if (!isWebBluetoothAvailable()) return false;
  try {
    const navAny = navigator as any;
    if (navAny.bluetooth && typeof navAny.bluetooth.getDevices === 'function') {
      const devices = await navAny.bluetooth.getDevices();
      if (!devices || devices.length === 0) return false;
      const savedId = localStorage.getItem('wivote_paired_bt_printer_id');
      const targetDevice = devices.find((d: any) => d.id === savedId) || devices[0];
      if (targetDevice) {
        const printerName = targetDevice.name || 'Bluetooth Thermal Printer';
        const gattRes = await connectDeviceGatt(targetDevice);
        if (gattRes.success && gattRes.characteristic) {
          activePrinter = {
            id: targetDevice.id,
            name: printerName,
            device: targetDevice,
            characteristic: gattRes.characteristic,
            connectionType: 'bluetooth_ble',
            isConnected: true
          };
          notifyPrinterChange();
          return true;
        }
      }
    }
  } catch (e) {
    console.warn('[BT Printer] Auto-connect to saved printer failed:', e);
  }
  return false;
}

/**
 * Prompts user to detect and select their paired or nearby Bluetooth thermal printer (BLE)
 */
export async function detectAndConnectBTPrinter(): Promise<{
  success: boolean;
  printerName?: string;
  error?: string;
  isIframeBlocked?: boolean;
}> {
  if (!isWebBluetoothAvailable()) {
    return {
      success: false,
      error: 'Web Bluetooth is not supported in this browser. You can use Web Serial (Bluetooth SPP) or the Thermal Slip Print dialog.'
    };
  }

  try {
    const navAny = navigator as any;
    let device: any = null;

    try {
      // Request device with all thermal printer service UUIDs in 128-bit format
      device = await navAny.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: THERMAL_PRINTER_SERVICES
      });
    } catch (reqErr: any) {
      if (
        reqErr.name === 'SecurityError' ||
        reqErr.message?.includes('permissions policy') ||
        reqErr.message?.includes('disallowed')
      ) {
        return {
          success: false,
          isIframeBlocked: true,
          error: 'Bluetooth access is blocked inside iframe previews. Open the app in a new tab to link your Bluetooth printer directly.'
        };
      }
      if (
        reqErr.name === 'NotFoundError' ||
        reqErr.message?.includes('cancelled') ||
        reqErr.message?.includes('User cancelled')
      ) {
        return { success: false, error: 'Bluetooth selection cancelled by user.' };
      }
      throw reqErr;
    }

    if (!device) {
      return { success: false, error: 'No Bluetooth device selected.' };
    }

    const printerName = device.name || 'Bluetooth Thermal Printer';

    // Connect to GATT and discover write channel
    const gattRes = await connectDeviceGatt(device);
    if (!gattRes.success || !gattRes.characteristic) {
      return {
        success: false,
        error: gattRes.error || `Connected to ${printerName}, but could not establish write channel.`
      };
    }

    // If active printer was a serial port, close it first
    if (activePrinter?.serialPort) {
      try {
        await activePrinter.serialPort.close();
      } catch (e) {
        // Ignore
      }
    }

    // Set up active printer
    activePrinter = {
      id: device.id,
      name: printerName,
      device,
      characteristic: gattRes.characteristic,
      connectionType: 'bluetooth_ble',
      isConnected: true
    };

    try {
      localStorage.setItem('wivote_paired_bt_printer_id', device.id);
      localStorage.setItem('wivote_paired_bt_printer_name', printerName);
    } catch (e) {}

    // Auto-detect Sewoo model and set sensible defaults
    if (printerName.toUpperCase().includes('LK-P') || printerName.toUpperCase().includes('SEWOO')) {
      console.log('[BT Printer] Detected Sewoo LK-P Series Mobile Printer.');
    }

    // Handle sudden disconnection
    device.addEventListener('gattserverdisconnected', () => {
      console.log(`[BT Printer] Disconnected from ${printerName}`);
      if (activePrinter && activePrinter.id === device.id) {
        activePrinter = {
          ...activePrinter,
          isConnected: false,
          characteristic: undefined
        };
        notifyPrinterChange();
      }
    });

    notifyPrinterChange();

    try {
      localStorage.setItem('wivote_paired_bt_printer_name', printerName);
      localStorage.setItem('wivote_paired_bt_printer_id', device.id);
      localStorage.setItem('wivote_printer_conn_type', 'bluetooth_ble');
    } catch (e) {
      // Ignore
    }

    return {
      success: true,
      printerName
    };
  } catch (err: any) {
    console.error('Bluetooth printer connection error:', err);
    if (
      err.name === 'SecurityError' ||
      err.message?.includes('permissions policy') ||
      err.message?.includes('disallowed')
    ) {
      return {
        success: false,
        isIframeBlocked: true,
        error: 'Bluetooth access is blocked inside iframe previews. Open the app in a new tab to link your Bluetooth printer directly.'
      };
    }
    if (err.name === 'NotFoundError' || err.message?.includes('cancelled') || err.message?.includes('User cancelled')) {
      return { success: false, error: 'Bluetooth selection cancelled by user.' };
    }
    return {
      success: false,
      error: `${err.message || 'Failed to connect to Bluetooth printer.'} Tip: If connection fails repeatedly or peripheral drops, clear your native device Bluetooth cache (unpair/forget device in OS Settings) or toggle hardware Bluetooth discovery OFF and ON.`
    };
  }
}

/**
 * Connects to a Bluetooth Serial Port Profile (SPP) / USB Thermal Printer via Web Serial API
 * Ideal for Sewoo LK-P21B paired as a Bluetooth COM port on Windows, Mac, Linux, or Android
 */
export async function detectAndConnectSerialPrinter(baudRate: number = 115200): Promise<{
  success: boolean;
  printerName?: string;
  error?: string;
}> {
  if (!isWebSerialAvailable()) {
    return {
      success: false,
      error: 'Web Serial API is not supported in this browser. Please use Chrome/Edge on Desktop or Android.'
    };
  }

  try {
    const navAny = navigator as any;
    const port = await navAny.serial.requestPort();
    if (!port) {
      return { success: false, error: 'No serial port selected.' };
    }

    // Try common baud rates for thermal printers if initial open fails: 115200 (Sewoo default) -> 9600 -> 38400
    const ratesToTry = [baudRate, 9600, 115200, 38400].filter((v, i, a) => a.indexOf(v) === i);
    let opened = false;
    for (const rate of ratesToTry) {
      try {
        await port.open({ baudRate: rate });
        opened = true;
        console.log(`[Serial Printer] Opened serial port at ${rate} baud.`);
        break;
      } catch (openErr: any) {
        if (port.readable) {
          opened = true;
          break;
        }
      }
    }

    if (!opened) {
      return { success: false, error: 'Could not open serial port. Ensure no other application is using this COM port.' };
    }

    const printerName = 'Bluetooth SPP / Serial Printer (Sewoo/POS)';
    activePrinter = {
      id: 'serial_printer_port',
      name: printerName,
      serialPort: port,
      connectionType: 'serial_spp',
      isConnected: true
    };

    notifyPrinterChange();

    try {
      localStorage.setItem('wivote_paired_bt_printer_name', printerName);
      localStorage.setItem('wivote_printer_conn_type', 'serial_spp');
    } catch (e) {
      // Ignore
    }

    return { success: true, printerName };
  } catch (err: any) {
    if (err.name === 'NotFoundError' || err.message?.includes('cancelled') || err.message?.includes('User cancelled')) {
      return { success: false, error: 'Port selection cancelled.' };
    }
    return { success: false, error: err.message || 'Failed to connect via Web Serial.' };
  }
}

/**
 * Disconnects the active Bluetooth or Serial printer
 */
export async function disconnectBTPrinter(): Promise<void> {
  if (activePrinter) {
    if (activePrinter.device?.gatt?.connected) {
      try {
        await activePrinter.device.gatt.disconnect();
      } catch (e) {
        console.warn('Error disconnecting BT printer:', e);
      }
    }
    if (activePrinter.serialPort) {
      try {
        await activePrinter.serialPort.close();
      } catch (e) {
        console.warn('Error closing serial port:', e);
      }
    }
  }
  activePrinter = null;
  notifyPrinterChange();
}

/**
 * Encodes text string to byte array (CP437 or UTF-8)
 */
function textToBytes(text: string): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(text);
}

/**
 * Generates binary ESC/POS thermal printer commands
 * Optimized for 58mm / 2-inch mobile printers like Sewoo LK-P21B:
 * - Proper wake-up sequence (null bytes) for mobile battery power-saving
 * - CR+LF line terminations (\r\n) required by POS microcontrollers
 * - Large BOLD voucher access code box
 * - Prominent Agent Reference at the bottom
 * - Final paper feed & buffer flush (ESC d 4 + FF 0x0C)
 */
export function generateEscPosCommands(data: TicketPrintData): Uint8Array {
  const bytes: number[] = [];

  const append = (...nums: number[]) => {
    bytes.push(...nums);
  };

  const appendText = (str: string) => {
    const encoded = textToBytes(str);
    for (let i = 0; i < encoded.length; i++) {
      bytes.push(encoded[i]);
    }
  };

  // 1. Wake-up pulses for mobile thermal printers (Sewoo LK-P series battery sleep wake-up)
  append(0x00, 0x00, 0x00, 0x00);

  // 2. Initialize printer
  append(0x1B, 0x40); // ESC @ (Initialize printer hardware & clear buffer)
  append(0x1B, 0x74, 0x00); // ESC t 0 (Code page: Standard PC437)

  // 3. Center alignment
  append(0x1B, 0x61, 0x01); // ESC a 1 (Center)

  // Header Title
  append(0x1B, 0x45, 0x01); // ESC E 1 (Bold ON)
  appendText("=== WiVoTe ACCESS TICKET ===\r\n");
  append(0x1B, 0x45, 0x00); // ESC E 0 (Bold OFF)

  const brand = data.workspaceName || "VakZim ICT&E";
  appendText(`${brand.toUpperCase()}\r\n`);
  
  const dateStr = data.dateFormatted || new Date().toLocaleString();
  appendText(`${dateStr}\r\n`);

  if (data.networkName) {
    append(0x1B, 0x45, 0x01); // Bold ON
    appendText(`SSID: ${data.networkName}\r\n`);
    append(0x1B, 0x45, 0x00); // Bold OFF
  }

  appendText("--------------------------------\r\n");

  // 4. Left alignment for ticket details
  append(0x1B, 0x61, 0x00); // ESC a 0 (Left)
  if (data.customerNumber) {
    append(0x1B, 0x45, 0x01); // Bold ON
    appendText(`CUST NO : ${data.customerNumber}\r\n`);
    append(0x1B, 0x45, 0x00); // Bold OFF
  }
  appendText(`CLIENT  : ${data.customerName}\r\n`);
  if (data.customerCell && data.customerCell !== 'N/A') {
    appendText(`PHONE   : ${data.customerCell}\r\n`);
  }
  appendText(`PACKAGE : ${data.plan}\r\n`);
  appendText(`VALIDITY: ${data.duration}\r\n`);
  if (data.discountApplied && data.discountApplied > 0 && data.originalPrice) {
    appendText(`ORIGINAL: $${(data.originalPrice || 0).toFixed(2)}\r\n`);
    appendText(`DISCOUNT: -$${(data.discountApplied || 0).toFixed(2)}\r\n`);
    append(0x1B, 0x45, 0x01); // Bold ON
    appendText(`PAID    : $${(data.price || 0).toFixed(2)}\r\n`);
    append(0x1B, 0x45, 0x00); // Bold OFF
  } else {
    appendText(`PRICE   : $${(data.price || 0).toFixed(2)}\r\n`);
  }
  if (data.location && data.location !== 'Unassigned') {
    appendText(`LOCATION: ${data.location}\r\n`);
  }
  if (data.loyaltyNotice) {
    appendText("--------------------------------\r\n");
    appendText(`LOYALTY : ${data.loyaltyNotice}\r\n`);
  }

  // 5. Center alignment for Voucher Code
  append(0x1B, 0x61, 0x01); // ESC a 1 (Center)
  appendText("================================\r\n");
  append(0x1B, 0x45, 0x01); // Bold ON
  appendText("VOUCHER ACCESS CODE\r\n");
  append(0x1B, 0x45, 0x00); // Bold OFF
  appendText("--------------------------------\r\n");

  // --- REQUIREMENT: LARGE AND BOLD VOUCHER CODE ---
  append(0x1B, 0x45, 0x01); // ESC E 1 (Bold ON)
  append(0x1D, 0x21, 0x11); // GS ! 0x11 (Double Width + Double Height)
  appendText(`\r\n  ${data.code}  \r\n\r\n`);
  append(0x1D, 0x21, 0x00); // GS ! 0x00 (Normal font size)
  append(0x1B, 0x45, 0x00); // ESC E 0 (Bold OFF)

  appendText("--------------------------------\r\n");
  appendText("================================\r\n");

  // 6. REQUIREMENT: AGENT NAME AT THE BOTTOM FOR REFERENCE
  append(0x1B, 0x61, 0x01); // Center
  append(0x1B, 0x45, 0x01); // Bold ON
  appendText(`Served by: ${data.agentName}\r\n`);
  append(0x1B, 0x45, 0x00); // Bold OFF
  if (data.agentId) {
    appendText(`Agent ID : ${data.agentId}\r\n`);
  }
  appendText("Thank you for your business!\r\n");
  appendText("Keep this receipt for support.\r\n");

  // 7. Paper Feed, Buffer Flush and Cut
  appendText("\r\n\r\n");
  append(0x1B, 0x64, 0x04); // ESC d 4 (Feed 4 lines past the tear bar)
  append(0x0C); // FF (Form Feed / Flush buffer to immediately trigger thermal head)
  append(0x1D, 0x56, 0x00); // GS V 0 (Cut paper if cutter present; safe on manual tear bar)

  return new Uint8Array(bytes);
}

/**
 * Generates CPCL (Comtec / Sewoo / Zebra Mobile) printer commands
 * Native format for Sewoo LK-P21B mobile printers when configured in CPCL emulation mode.
 * 200 DPI, 384 dots width (58mm / 2-inch receipt).
 */
export function generateCpclCommands(data: TicketPrintData): Uint8Array {
  const brand = (data.workspaceName || "VakZim ICT&E").toUpperCase();
  const dateStr = data.dateFormatted || new Date().toLocaleString();

  // CPCL receipt program (Height ~680 dots, 1 copy)
  let cpcl = "! 0 200 200 700 1\r\n";
  cpcl += "PAGE-WIDTH 384\r\n";

  // Header Title
  cpcl += "CENTER\r\n";
  cpcl += "TEXT 4 0 0 20 WiVoTe ACCESS TICKET\r\n";
  cpcl += `TEXT 7 0 0 55 ${brand}\r\n`;
  cpcl += `TEXT 7 0 0 85 ${dateStr}\r\n`;
  if (data.networkName) {
    cpcl += `TEXT 7 0 0 115 SSID: ${data.networkName}\r\n`;
  }

  // Divider
  cpcl += "LINE 10 145 374 145 1\r\n";

  // Left Details
  cpcl += "LEFT\r\n";
  let y = 160;
  if (data.customerNumber) {
    cpcl += `TEXT 7 0 15 ${y} CUST NO : ${data.customerNumber}\r\n`;
    y += 26;
  }
  cpcl += `TEXT 7 0 15 ${y} CLIENT  : ${data.customerName}\r\n`;
  y += 26;
  if (data.customerCell && data.customerCell !== 'N/A') {
    cpcl += `TEXT 7 0 15 ${y} PHONE   : ${data.customerCell}\r\n`;
    y += 26;
  }
  cpcl += `TEXT 7 0 15 ${y} PACKAGE : ${data.plan}\r\n`;
  y += 26;
  cpcl += `TEXT 7 0 15 ${y} VALIDITY: ${data.duration}\r\n`;
  y += 26;
  if (data.discountApplied && data.discountApplied > 0 && data.originalPrice) {
    cpcl += `TEXT 7 0 15 ${y} ORIGINAL: $${(data.originalPrice || 0).toFixed(2)}\r\n`;
    y += 24;
    cpcl += `TEXT 7 0 15 ${y} DISCOUNT: -$${(data.discountApplied || 0).toFixed(2)}\r\n`;
    y += 24;
    cpcl += `TEXT 7 0 15 ${y} PAID    : $${(data.price || 0).toFixed(2)}\r\n`;
    y += 26;
  } else {
    cpcl += `TEXT 7 0 15 ${y} PRICE   : $${(data.price || 0).toFixed(2)}\r\n`;
    y += 26;
  }
  if (data.location && data.location !== 'Unassigned') {
    cpcl += `TEXT 7 0 15 ${y} LOCATION: ${data.location}\r\n`;
    y += 26;
  }

  // Large Bold Voucher Code Box
  y += 10;
  cpcl += "CENTER\r\n";
  cpcl += `LINE 10 ${y} 374 ${y} 2\r\n`;
  y += 15;
  cpcl += `TEXT 7 0 0 ${y} VOUCHER ACCESS CODE\r\n`;
  y += 30;
  // Large double font: Font 4 (Large) or Font 5
  cpcl += `TEXT 4 0 0 ${y} ${data.code}\r\n`;
  y += 45;
  cpcl += `LINE 10 ${y} 374 ${y} 2\r\n`;
  y += 20;

  // Agent Reference at bottom
  cpcl += `TEXT 7 0 0 ${y} Served by: ${data.agentName}\r\n`;
  y += 26;
  if (data.agentId) {
    cpcl += `TEXT 7 0 0 ${y} Agent ID: ${data.agentId}\r\n`;
    y += 26;
  }
  cpcl += `TEXT 7 0 0 ${y} Thank you for your business!\r\n`;
  y += 30;

  // Print execution & form feed
  cpcl += "FORM\r\n";
  cpcl += "PRINT\r\n";

  return textToBytes(cpcl);
}

/**
 * Transmits binary payload over Bluetooth GATT in standard 20-byte chunks.
 * Uses 20-byte BLE MTU limit + inter-chunk pacing to prevent hardware buffer overruns on Sewoo LK-P21B.
 */
export async function sendToBluetoothPrinter(characteristic: any, data: Uint8Array): Promise<void> {
  // CRITICAL BLE CONSTRAINT: Maximum 20 bytes payload per write packet without MTU exchange.
  // Using 20 bytes guarantees universal compatibility with all Bluetooth 4.0/4.2/5.0 mobile printers.
  const CHUNK_SIZE = 20;
  const props = characteristic.properties || {};

  // Short initial pause to let printer MCU awaken
  await new Promise(res => setTimeout(res, 50));

  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    let written = false;

    // 1. Prefer writeValueWithoutResponse (standard for thermal receipt printers)
    if (props.writeWithoutResponse && typeof characteristic.writeValueWithoutResponse === 'function') {
      try {
        await characteristic.writeValueWithoutResponse(chunk);
        written = true;
      } catch (err) {
        console.warn('[BT Printer] writeValueWithoutResponse failed, attempting with-response...', err);
      }
    }

    // 2. Try writeValueWithResponse
    if (!written && props.write && typeof characteristic.writeValueWithResponse === 'function') {
      try {
        await characteristic.writeValueWithResponse(chunk);
        written = true;
      } catch (err) {
        console.warn('[BT Printer] writeValueWithResponse failed...', err);
      }
    }

    // 3. Fallback to legacy writeValue
    if (!written && typeof characteristic.writeValue === 'function') {
      try {
        await characteristic.writeValue(chunk);
        written = true;
      } catch (err) {
        console.warn('[BT Printer] writeValue failed...', err);
      }
    }

    // 4. Force write attempt if supported
    if (!written) {
      if (typeof characteristic.writeValueWithoutResponse === 'function') {
        await characteristic.writeValueWithoutResponse(chunk);
      } else if (typeof characteristic.writeValueWithResponse === 'function') {
        await characteristic.writeValueWithResponse(chunk);
      } else {
        throw new Error('No supported write method available on printer characteristic');
      }
    }

    // Pacing delay (20ms) between 20-byte packets to prevent printer receive buffer overrun
    await new Promise(res => setTimeout(res, 20));
  }
}

/**
 * Transmits binary payload to a serial port (Web Serial API)
 */
export async function sendToSerialPrinter(port: any, data: Uint8Array): Promise<void> {
  if (!port.writable) {
    await port.open({ baudRate: 115200 });
  }
  const writer = port.writable.getWriter();
  try {
    await writer.write(data);
  } finally {
    writer.releaseLock();
  }
}

/**
 * Triggers printing via the RawBT Android Print Service scheme
 * Enables instant Bluetooth thermal printing to any paired Sewoo LK-P21B on Android smartphones
 */
export function printViaRawBt(data: TicketPrintData): boolean {
  try {
    const escpos = generateEscPosCommands(data);
    let binary = '';
    const bytes = new Uint8Array(escpos);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const rawBtUrl = `rawbt:data:application/octet-stream;base64,${base64}`;
    window.location.href = rawBtUrl;
    return true;
  } catch (err) {
    console.error('RawBT print error:', err);
    return false;
  }
}

/**
 * High-contrast Black and White 58mm/80mm Thermal Receipt Print Window
 * Uses browser print engine formatted strictly for pure thermal paper
 */
export function printTicketViaThermalWindow(data: TicketPrintData): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const printIframe = document.createElement('iframe');
      printIframe.style.position = 'fixed';
      printIframe.style.right = '0';
      printIframe.style.bottom = '0';
      printIframe.style.width = '0';
      printIframe.style.height = '0';
      printIframe.style.border = 'none';
      document.body.appendChild(printIframe);

      const doc = printIframe.contentWindow?.document;
      if (!doc) {
        document.body.removeChild(printIframe);
        window.print();
        resolve(true);
        return;
      }

      const dateStr = data.dateFormatted || new Date().toLocaleString();
      const brand = data.workspaceName || "VakZim ICT&E";

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>WiVoTe Receipt - ${data.code}</title>
          <style>
            @page {
              size: 58mm auto;
              margin: 0;
            }
            @media print {
              html, body {
                width: 58mm;
                margin: 0;
                padding: 0;
                background: #ffffff !important;
                color: #000000 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
            }
            body {
              font-family: 'Courier New', Courier, monospace, monospace;
              width: 58mm;
              margin: 0 auto;
              padding: 4mm 3mm 8mm 3mm;
              background: #ffffff;
              color: #000000;
              box-sizing: border-box;
              font-size: 11px;
              line-height: 1.35;
            }
            .center {
              text-align: center;
            }
            .bold {
              font-weight: 900;
            }
            .header-title {
              font-size: 14px;
              font-weight: 900;
              letter-spacing: 0.5px;
              margin-bottom: 2px;
            }
            .sub-title {
              font-size: 10px;
              font-weight: 700;
              margin-bottom: 4px;
            }
            .divider {
              border-top: 1px dashed #000000;
              margin: 5px 0;
            }
            .double-divider {
              border-top: 2px solid #000000;
              margin: 6px 0;
            }
            .details-table {
              width: 100%;
              border-collapse: collapse;
              margin: 4px 0;
              font-size: 11px;
            }
            .details-table td {
              padding: 2px 0;
              vertical-align: top;
            }
            .details-table .label {
              font-weight: 700;
              width: 42%;
            }
            .details-table .value {
              font-weight: 700;
              text-align: right;
              width: 58%;
              word-break: break-all;
            }
            /* LARGE AND BOLD VOUCHER CODE BOX (PURE BLACK AND WHITE) */
            .code-box {
              border: 3px solid #000000;
              background-color: #ffffff;
              color: #000000;
              padding: 8px 4px;
              margin: 8px 0;
              text-align: center;
            }
            .code-label {
              font-size: 10px;
              font-weight: 900;
              letter-spacing: 1px;
              margin-bottom: 4px;
            }
            .code-value {
              font-size: 22px;
              font-weight: 900;
              letter-spacing: 2.5px;
              line-height: 1.15;
              word-break: break-all;
              padding: 2px 0;
            }
            /* AGENT REFERENCE AT BOTTOM */
            .agent-footer {
              margin-top: 8px;
              padding-top: 5px;
              border-top: 1px dashed #000000;
              text-align: center;
              font-size: 10px;
            }
            .agent-name {
              font-size: 11px;
              font-weight: 900;
            }
            .footer-msg {
              font-size: 9px;
              margin-top: 3px;
            }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="header-title">WiVoTe ACCESS RECEIPT</div>
            <div class="sub-title">${brand.toUpperCase()}</div>
            <div style="font-size: 9px;">${dateStr}</div>
            ${data.networkName ? `<div style="font-size: 10px; font-weight: 800; margin-top: 2px;">SSID: ${data.networkName}</div>` : ''}
          </div>

          <div class="divider"></div>

          <table class="details-table">
            ${data.customerNumber ? `
            <tr>
              <td class="label">CUST NO:</td>
              <td class="value" style="font-weight: 900; letter-spacing: 0.5px;">${data.customerNumber}</td>
            </tr>
            ` : ''}
            <tr>
              <td class="label">CLIENT:</td>
              <td class="value">${data.customerName}</td>
            </tr>
            ${data.customerCell && data.customerCell !== 'N/A' ? `
            <tr>
              <td class="label">PHONE:</td>
              <td class="value">${data.customerCell}</td>
            </tr>
            ` : ''}
            <tr>
              <td class="label">PLAN:</td>
              <td class="value">${data.plan}</td>
            </tr>
            <tr>
              <td class="label">VALIDITY:</td>
              <td class="value">${data.duration}</td>
            </tr>
            ${data.discountApplied && data.discountApplied > 0 && data.originalPrice ? `
            <tr>
              <td class="label">ORIGINAL:</td>
              <td class="value"><strike>$${(data.originalPrice || 0).toFixed(2)}</strike></td>
            </tr>
            <tr>
              <td class="label">DISCOUNT:</td>
              <td class="value">-$${(data.discountApplied || 0).toFixed(2)}</td>
            </tr>
            <tr>
              <td class="label" style="font-weight: 900;">PAID:</td>
              <td class="value" style="font-weight: 900;">$${(data.price || 0).toFixed(2)}</td>
            </tr>
            ` : `
            <tr>
              <td class="label">AMOUNT:</td>
              <td class="value">$${(data.price || 0).toFixed(2)}</td>
            </tr>
            `}
            ${data.location && data.location !== 'Unassigned' ? `
            <tr>
              <td class="label">LOCATION:</td>
              <td class="value">${data.location}</td>
            </tr>
            ` : ''}
            ${data.loyaltyNotice ? `
            <tr>
              <td colspan="2" style="padding-top: 4px; border-top: 1px dashed #000; font-size: 10px; font-weight: 800; text-align: center;">
                LOYALTY: ${data.loyaltyNotice}
              </td>
            </tr>
            ` : ''}
          </table>

          <div class="double-divider"></div>

          <!-- LARGE AND BOLD VOUCHER CODE BOX -->
          <div class="code-box">
            <div class="code-label">VOUCHER ACCESS CODE</div>
            <div class="code-value">${data.code}</div>
          </div>

          <div class="double-divider"></div>

          <!-- AGENT NAME AT THE BOTTOM FOR REFERENCE -->
          <div class="agent-footer">
            <div>SERVED BY:</div>
            <div class="agent-name">${data.agentName}</div>
            ${data.agentId ? `<div style="font-size: 8px;">ID: ${data.agentId}</div>` : ''}
            <div class="footer-msg">Thank you for your business!</div>
            <div class="footer-msg">Authorized WiVoTe POS Terminal</div>
          </div>
        </body>
        </html>
      `;

      doc.open();
      doc.write(htmlContent);
      doc.close();

      setTimeout(() => {
        try {
          printIframe.contentWindow?.focus();
          printIframe.contentWindow?.print();
          setTimeout(() => {
            if (document.body.contains(printIframe)) {
              document.body.removeChild(printIframe);
            }
            resolve(true);
          }, 1500);
        } catch (e) {
          console.error("Iframe print error:", e);
          window.print();
          resolve(true);
        }
      }, 350);
    } catch (err) {
      console.error("Thermal window print error:", err);
      window.print();
      resolve(true);
    }
  });
}

/**
 * Universal print handler:
 * 1. Checks if a Bluetooth printer (BLE or Serial SPP) is already paired and connected.
 * 2. If connected, sends binary data (ESC/POS or CPCL based on emulation setting) directly to the printer.
 * 3. If transmission fails, tries auto-reconnecting.
 * 4. Falls back gracefully to pure black-and-white thermal print dialog if no printer is connected.
 */
export async function printReceiptUniversal(data: TicketPrintData): Promise<{
  success: boolean;
  method: 'bluetooth' | 'thermal_window';
  printerName?: string;
  emulation?: PrinterEmulation;
  error?: string;
}> {
  const emulation = getPrinterEmulation();
  const payload = emulation === 'cpcl' ? generateCpclCommands(data) : generateEscPosCommands(data);

  // 1. If active Bluetooth BLE printer is currently connected with writable characteristic
  if (activePrinter && activePrinter.isConnected && activePrinter.connectionType === 'bluetooth_ble' && activePrinter.characteristic) {
    try {
      console.log(`[BT Printer] Transmitting ${emulation.toUpperCase()} payload to connected BLE printer: ${activePrinter.name}...`);
      await sendToBluetoothPrinter(activePrinter.characteristic, payload);
      return {
        success: true,
        method: 'bluetooth',
        printerName: activePrinter.name,
        emulation
      };
    } catch (err: any) {
      console.warn('Error sending to active Bluetooth printer, attempting reconnect...', err);
      activePrinter.isConnected = false;
      notifyPrinterChange();
    }
  }

  // 2. If active Serial SPP printer is connected
  if (activePrinter && activePrinter.isConnected && activePrinter.connectionType === 'serial_spp' && activePrinter.serialPort) {
    try {
      console.log(`[Serial Printer] Transmitting ${emulation.toUpperCase()} payload to serial port...`);
      await sendToSerialPrinter(activePrinter.serialPort, payload);
      return {
        success: true,
        method: 'bluetooth',
        printerName: activePrinter.name,
        emulation
      };
    } catch (serialErr: any) {
      console.warn('Error sending to Serial printer port:', serialErr);
      activePrinter.isConnected = false;
      notifyPrinterChange();
    }
  }

  // 3. If an active printer device is remembered, try auto-reconnecting
  if (activePrinter && activePrinter.device && isWebBluetoothAvailable()) {
    try {
      const reconnected = await reconnectActivePrinter();
      if (reconnected && activePrinter.characteristic) {
        console.log(`[BT Printer] Reconnected successfully to ${activePrinter.name}, transmitting ${emulation.toUpperCase()}...`);
        await sendToBluetoothPrinter(activePrinter.characteristic, payload);
        return {
          success: true,
          method: 'bluetooth',
          printerName: activePrinter.name,
          emulation
        };
      }
    } catch (e) {
      console.warn('[BT Printer] Reconnect attempt failed:', e);
    }
  }

  // 4. If user previously granted a Bluetooth device, try auto-connecting without showing picker
  if (isWebBluetoothAvailable()) {
    try {
      const autoConnected = await autoConnectSavedPrinter();
      if (autoConnected && activePrinter?.characteristic) {
        console.log(`[BT Printer] Auto-connected to saved printer: ${activePrinter.name}, transmitting...`);
        await sendToBluetoothPrinter(activePrinter.characteristic, payload);
        return {
          success: true,
          method: 'bluetooth',
          printerName: activePrinter.name,
          emulation
        };
      }
    } catch (btErr: any) {
      console.warn('[BT Printer] Auto-connect attempt encountered error:', btErr);
    }
  }

  // 5. Graceful thermal receipt print window fallback (guarantees receipt always prints on any device)
  await printTicketViaThermalWindow(data);
  return {
    success: true,
    method: 'thermal_window'
  };
}

/**
 * Robust, production-ready Web Bluetooth snippet for legacy thermal printers.
 * Handles dropped name packets, wide service profiles, 20-byte MTU pacing, and cache clearing alerts.
 * 
 * @param printData - Raw binary ESC/POS or CPCL Uint8Array or UTF-8 text string to print
 * @param options - Optional configuration overrides
 */
export async function printToLegacyThermalPrinter(
  printData: Uint8Array | string,
  options: {
    chunkSize?: number;
    chunkDelayMs?: number;
    onStatus?: (status: string) => void;
  } = {}
): Promise<{ success: boolean; deviceName?: string; error?: string }> {
  const { chunkSize = 20, chunkDelayMs = 25, onStatus } = options;
  const updateStatus = (msg: string) => {
    console.log(`[Legacy BT Printer] ${msg}`);
    if (onStatus) onStatus(msg);
  };

  // Convert string input to Uint8Array if text was provided
  const payload: Uint8Array =
    typeof printData === 'string' ? new TextEncoder().encode(printData) : printData;

  // 1. Environmental sanity check
  if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
    const errorMsg =
      'Web Bluetooth API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or Bluefy on iOS.';
    updateStatus(errorMsg);
    return { success: false, error: errorMsg };
  }

  // 2. Comprehensive GATT Service UUIDs mapping standard serial & BLE printing profiles
  const OPTIONAL_PRINTING_SERVICES = [
    // Standard POS / Thermal Printer GATT Service
    '000018f0-0000-1000-8000-00805f9b34fb',
    '000018f1-0000-1000-8000-00805f9b34fb',
    '000018f2-0000-1000-8000-00805f9b34fb',

    // Standard Serial Port Profile (SPP) GATT definitions
    '00001101-0000-1000-8000-00805f9b34fb',

    // ISSC / Sewoo Transparent UART Service
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '00004953-0000-1000-8000-00805f9b34fb',

    // HM-10 / CC2540 / POS-58 / POS-80 / Zijiang / Milestone UART
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000ffe1-0000-1000-8000-00805f9b34fb',

    // Generic ESC/POS thermal printer services
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000ff01-0000-1000-8000-00805f9b34fb',
    '0000ff02-0000-1000-8000-00805f9b34fb',
    '0000ff80-0000-1000-8000-00805f9b34fb',
    '0000ffb0-0000-1000-8000-00805f9b34fb',

    // Woosim / Sewoo Custom BLE Services
    '0000ae30-0000-1000-8000-00805f9b34fb',
    '0000ae00-0000-1000-8000-00805f9b34fb',
    '0000ae01-0000-1000-8000-00805f9b34fb',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',

    // Nordic Semiconductor UART Service (NUS)
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e',

    // Dialog / Telink / Beken / PeriPage / Goojprt POS
    '0000fee7-0000-1000-8000-00805f9b34fb',
    '0000fee0-0000-1000-8000-00805f9b34fb',
    '0000fef5-0000-1000-8000-00805f9b34fb',
    '0000fef4-0000-1000-8000-00805f9b34fb',

    // Custom Serial & Device Info Services
    '0000fff0-0000-1000-8000-00805f9b34fb',
    '0000fff1-0000-1000-8000-00805f9b34fb',
    '0000fff2-0000-1000-8000-00805f9b34fb',
    '0000180a-0000-1000-8000-00805f9b34fb'
  ];

  let device: any = null;
  let server: any = null;

  try {
    // 3. Step 1: Device Request (acceptAllDevices: true to prevent drops from missing advertising names)
    updateStatus('Requesting Bluetooth device (acceptAllDevices enabled)...');
    device = await (navigator as any).bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: OPTIONAL_PRINTING_SERVICES
    });

    if (!device) {
      return { success: false, error: 'No Bluetooth device was selected.' };
    }

    const deviceName = device.name || 'Unnamed Thermal Printer';
    updateStatus(`Device selected: ${deviceName} (${device.id})`);

    // 4. Step 2: GATT Server Connection with retry logic
    updateStatus('Connecting to GATT server...');
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        if (device.gatt?.connected) {
          server = device.gatt;
          break;
        }
        server = await device.gatt.connect();
        if (server?.connected) break;
      } catch (connErr) {
        console.warn(`[Legacy BT Printer] Connection attempt ${attempt} failed:`, connErr);
        if (attempt < 3) {
          await new Promise(res => setTimeout(res, 400));
        } else {
          throw connErr;
        }
      }
    }

    if (!server?.connected) {
      throw new Error(`Failed to establish GATT connection with ${deviceName}.`);
    }

    // Brief stabilization pause for legacy peripheral microcontrollers
    await new Promise(res => setTimeout(res, 250));

    // 5. Step 3: Primary Service Discovery
    updateStatus('Discovering primary print service...');
    let targetCharacteristic: any = null;

    // A. First try known thermal printer service UUIDs in order of prevalence
    for (const serviceUuid of OPTIONAL_PRINTING_SERVICES) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        if (!service) continue;

        const characteristics = await service.getCharacteristics();

        // 6. Step 4: Characteristic Capture
        // Filter characteristics that support writeWithoutResponse or write, excluding known read-only control descriptors
        const writable = characteristics.filter((c: any) => {
          const props = c.properties || {};
          const uuid = c.uuid.toLowerCase();
          // Exclude standard read-only or configuration points
          if (
            uuid.includes('2a00') || // Device name
            uuid.includes('2a01') || // Appearance
            uuid.includes('2a05') || // Service changed
            uuid.includes('aca3')    // ISSC Control Point
          ) {
            return false;
          }
          return Boolean(props.writeWithoutResponse || props.write);
        });

        if (writable.length > 0) {
          // Prefer writeWithoutResponse for rapid thermal print streaming
          targetCharacteristic =
            writable.find((c: any) => c.properties?.writeWithoutResponse) || writable[0];
          updateStatus(
            `Found writable characteristic: ${targetCharacteristic.uuid} on service: ${serviceUuid}`
          );
          break;
        }
      } catch (_serviceErr) {
        // Service not supported on this specific device, iterate to next
      }
    }

    // B. Fallback: If not found in known list, scan all services returned by device
    if (!targetCharacteristic && typeof server.getPrimaryServices === 'function') {
      try {
        const allServices = await server.getPrimaryServices();
        for (const service of allServices) {
          try {
            const characteristics = await service.getCharacteristics();
            const writable = characteristics.filter((c: any) => {
              const props = c.properties || {};
              return Boolean(props.writeWithoutResponse || props.write);
            });
            if (writable.length > 0) {
              targetCharacteristic =
                writable.find((c: any) => c.properties?.writeWithoutResponse) || writable[0];
              updateStatus(
                `Fallback characteristic captured: ${targetCharacteristic.uuid} on service: ${service.uuid}`
              );
              break;
            }
          } catch (_e) {
            // Ignore service-level enumeration error
          }
        }
      } catch (_e) {
        console.warn('Fallback getPrimaryServices enumeration failed:', _e);
      }
    }

    if (!targetCharacteristic) {
      throw new Error(
        `Connected to ${deviceName}, but could not find a writable thermal print characteristic.`
      );
    }

    // 7. Step 5: Data Stream Write Logic (Chunked MTU transmission with pacing)
    updateStatus(`Writing ${payload.length} bytes to printer stream in ${chunkSize}-byte chunks...`);

    // Wake-up delay for battery-powered thermal microcontrollers
    await new Promise(res => setTimeout(res, 60));

    for (let offset = 0; offset < payload.length; offset += chunkSize) {
      const chunk = payload.slice(offset, offset + chunkSize);
      const props = targetCharacteristic.properties || {};
      let chunkWritten = false;

      // Prefer writeValueWithoutResponse (standard for high-speed thermal slip data)
      if (props.writeWithoutResponse && typeof targetCharacteristic.writeValueWithoutResponse === 'function') {
        try {
          await targetCharacteristic.writeValueWithoutResponse(chunk);
          chunkWritten = true;
        } catch (_err) {
          // Fallback to with-response if without-response rejected
        }
      }

      // Secondary writeValueWithResponse
      if (!chunkWritten && props.write && typeof targetCharacteristic.writeValueWithResponse === 'function') {
        try {
          await targetCharacteristic.writeValueWithResponse(chunk);
          chunkWritten = true;
        } catch (_err) {
          // Fallback to legacy
        }
      }

      // Universal legacy fallback
      if (!chunkWritten && typeof targetCharacteristic.writeValue === 'function') {
        await targetCharacteristic.writeValue(chunk);
        chunkWritten = true;
      }

      if (!chunkWritten) {
        throw new Error('Characteristic does not permit any supported write operations.');
      }

      // Pacing delay to prevent buffer overrun on older microcontrollers (e.g. Sewoo LK-P, HM-10)
      if (chunkDelayMs > 0 && offset + chunkSize < payload.length) {
        await new Promise(res => setTimeout(res, chunkDelayMs));
      }
    }

    updateStatus(`✓ Print stream transmission completed successfully to ${deviceName}.`);
    return {
      success: true,
      deviceName
    };
  } catch (err: any) {
    console.error('[Legacy BT Printer] Full chain error:', err);

    // User cancelled dialog
    if (
      err.name === 'NotFoundError' ||
      err.message?.includes('User cancelled') ||
      err.message?.includes('cancelled')
    ) {
      return { success: false, error: 'Device selection cancelled by user.' };
    }

    // Iframe permission restriction
    if (
      err.name === 'SecurityError' ||
      err.message?.includes('permissions policy') ||
      err.message?.includes('disallowed')
    ) {
      return {
        success: false,
        error:
          'Web Bluetooth access is blocked inside iframe previews. Open the app in a dedicated top-level browser tab.'
      };
    }

    // 8. Requirement 5: Fallback handler alerting user to clear Bluetooth cache or toggle discovery
    const fallbackAdvice =
      `⚠️ Bluetooth Pairing / GATT Connection Failure: "${err.message || 'Operation failed'}".\n\n` +
      `Recommended Resolution for Older Thermal Printers:\n` +
      `1. Clear Native OS Bluetooth Cache: Open your phone or PC Bluetooth Settings, find the printer, and tap "Unpair" or "Forget Device".\n` +
      `2. Toggle Hardware Discovery: Turn your device's Bluetooth OFF, wait 5 seconds, and turn it back ON.\n` +
      `3. Power Cycle Printer: Turn the thermal printer OFF and ON to clear its internal UART buffer.\n` +
      `4. Re-run Discovery: Open in a clean top-level Chrome or Edge window and retry connection.`;

    updateStatus(fallbackAdvice);
    return {
      success: false,
      error: fallbackAdvice
    };
  }
}
