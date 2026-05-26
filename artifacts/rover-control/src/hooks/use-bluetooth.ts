import { useState, useRef, useCallback } from "react";

export type BtStatus = "unavailable" | "idle" | "connecting" | "connected" | "disconnected" | "error";

export interface BluetoothRoverDevice {
  name: string;
  device: BluetoothDevice;
}

// Standard Nordic UART Service (NUS) used by many Arduino BLE modules (HC-08, HM-10, nRF52)
const UART_SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const UART_TX_CHAR_UUID = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"; // notify (device → browser)
const UART_RX_CHAR_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"; // write (browser → device)

// Fallback: also accept any device with generic_access
const FALLBACK_FILTERS = [{ namePrefix: "Rover" }, { namePrefix: "Arduino" }, { namePrefix: "HC-" }, { namePrefix: "HM-" }];

interface UseBluetoothReturn {
  btStatus: BtStatus;
  btDevice: BluetoothRoverDevice | null;
  btLog: string[];
  isAvailable: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendCommand: (cmd: string) => Promise<boolean>;
}

export function useBluetooth(): UseBluetoothReturn {
  const isAvailable = typeof navigator !== "undefined" && "bluetooth" in navigator;

  const [btStatus, setBtStatus] = useState<BtStatus>(isAvailable ? "idle" : "unavailable");
  const [btDevice, setBtDevice] = useState<BluetoothRoverDevice | null>(null);
  const [btLog, setBtLog] = useState<string[]>([]);

  const rxCharRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);
  const deviceRef = useRef<BluetoothDevice | null>(null);

  const appendLog = useCallback((msg: string) => {
    setBtLog((prev) => [...prev.slice(-49), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const connect = useCallback(async () => {
    if (!isAvailable) return;
    setBtStatus("connecting");
    appendLog("Scanning for BLE devices...");

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: FALLBACK_FILTERS,
        optionalServices: [UART_SERVICE_UUID],
      }).catch(() =>
        // fallback: accept any BLE device
        navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: [UART_SERVICE_UUID],
        })
      );

      deviceRef.current = device;
      appendLog(`Connecting to "${device.name ?? "Unknown Device"}"...`);

      device.addEventListener("gattserverdisconnected", () => {
        setBtStatus("disconnected");
        setBtDevice(null);
        rxCharRef.current = null;
        appendLog("Device disconnected.");
      });

      const server = await device.gatt!.connect();
      appendLog("GATT connected. Discovering services...");

      let rxChar: BluetoothRemoteGATTCharacteristic | null = null;

      try {
        const service = await server.getPrimaryService(UART_SERVICE_UUID);
        rxChar = await service.getCharacteristic(UART_RX_CHAR_UUID);
        const txChar = await service.getCharacteristic(UART_TX_CHAR_UUID);
        await txChar.startNotifications();
        txChar.addEventListener("characteristicvaluechanged", (event) => {
          const val = (event.target as BluetoothRemoteGATTCharacteristic).value;
          if (val) {
            const text = new TextDecoder().decode(val);
            appendLog(`RX: ${text.trim()}`);
          }
        });
        appendLog("UART service ready.");
      } catch {
        appendLog("UART service not found — connected without UART. Commands will use UART write if available.");
      }

      rxCharRef.current = rxChar;
      setBtDevice({ name: device.name ?? "Unknown Device", device });
      setBtStatus("connected");
      appendLog(`Connected to "${device.name ?? "Unknown Device"}"`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("cancelled") || msg.includes("chosen")) {
        appendLog("Scan cancelled by user.");
        setBtStatus("idle");
      } else {
        appendLog(`Error: ${msg}`);
        setBtStatus("error");
      }
    }
  }, [isAvailable, appendLog]);

  const disconnect = useCallback(() => {
    if (deviceRef.current?.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    setBtStatus("idle");
    setBtDevice(null);
    rxCharRef.current = null;
    appendLog("Disconnected.");
  }, [appendLog]);

  const sendCommand = useCallback(async (cmd: string): Promise<boolean> => {
    if (!rxCharRef.current) {
      appendLog(`TX failed (no RX char): ${cmd}`);
      return false;
    }
    try {
      const encoded = new TextEncoder().encode(cmd + "\n");
      await rxCharRef.current.writeValueWithoutResponse(encoded);
      appendLog(`TX: ${cmd}`);
      return true;
    } catch (err) {
      appendLog(`TX error: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }, [appendLog]);

  return { btStatus, btDevice, btLog, isAvailable, connect, disconnect, sendCommand };
}
