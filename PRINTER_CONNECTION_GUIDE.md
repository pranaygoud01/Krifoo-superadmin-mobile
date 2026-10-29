# Krifoo POS Thermal Printer Connection Guide

A comprehensive guide for configuring and connecting receipt printers to the **Krifoo Admin** POS application across all connection protocols and operating systems (**Android & iOS**).

---

## Quick Reference Matrix

| Connection Mode | Android Support | iOS Support | Typical Hardware / Brands | Default Port / Target |
| :--- | :---: | :---: | :--- | :--- |
| **Wi-Fi / LAN (Network)** | ✅ Fully Supported | ✅ Fully Supported | Bonkaso (POS-8390), Epson, Star, Xprinter, Rongta, Munbyn | **Port 9100** (ESC/POS RAW) <br> **Port 8008 / 80** (Epson ePOS XML) |
| **Bluetooth (Classic SPP)** | ✅ Fully Supported | ❌ *Apple MFi Restricted* | Desktop Bluetooth thermal stations, 58mm/80mm portable BT printers | Bluetooth MAC / Name (`00:11:22:...` or `BT:...`) |
| **Bluetooth (BLE GATT)** | ✅ Supported | ✅ Supported | Epson TM-m30 / TM-m30II, Star TSP143IV / mC-Print | Device BLE UUID |
| **Sunmi POS Built-in** | ✅ Fully Supported | ❌ *(Hardware Specific)* | Sunmi V2, V2 Pro, V2s, T2, T2 Mini, D2s handhelds & terminals | Internal AIDL Service (`woyou.aidlservice`) |
| **System Print Spooler** | ✅ Fully Supported | ✅ Fully Supported | Any AirPrint / Android Mopria certified Wi-Fi or USB printer | OS Print Spooler (`Print.printAsync`) |

---

## 1. Network Printers (Wi-Fi & Ethernet LAN)

Network printing is the **recommended production setup** for restaurant POS environments. It provides high speed, wide range across the kitchen and front counter, and eliminates Bluetooth pairing drops.

### Step 1: Physical Setup & IP Discovery
1. Connect the printer to your Wi-Fi router using an RJ45 Ethernet cable.
2. Turn the printer power switch **ON**. Verify that the Ethernet port link lights (Green/Orange LED) are blinking.
3. **Print the Configuration Slip:**
   - Turn the printer power switch **OFF**.
   - Hold down the **FEED** button.
   - While holding **FEED**, turn the power switch **ON**.
   - Keep holding **FEED** for 2–3 seconds until the printer starts printing, then release.
   - Look for the **IP Address**, **Subnet Mask**, and **Gateway** on the printed slip (e.g., `IP: 192.168.1.200`, `Gateway: 192.168.1.1`).

> **Important (Subnet Matching):**
> If the printed slip displays `192.168.0.200` but your router is on `192.168.1.x`, use the manufacturer's network utility tool (such as `PRINT_SET V1.5` on PC) via UDP broadcast (*"Cross network set IP"*) to change the printer IP to match your router's subnet (e.g., `192.168.1.200`).

### Step 2: Connecting in Krifoo Admin (Android & iOS)
1. Open **Krifoo Admin**.
2. Navigate to **Printer Settings** (gear icon or sidebar) → tap **Printer Setup Wizard** (or **Change Setup**).
3. In **Step 1 (Choose Connection Type)**: Select **Wi-Fi / LAN Network**.
4. In **Step 2 (Enter IP & Port)**:
   - **Printer IP Address**: Enter the printer's static IP (e.g., `192.168.1.200`).
   - **Port**: 
     - Enter **`9100`** for universal thermal printers (Bonkaso, Star RAW, Xprinter, Epson RAW).
     - Enter **`8008`** or **`80`** *only* if using Epson ePOS-Print HTTP/SOAP XML.
   - Tap **Connect & Continue**.
5. In **Step 3 (Preferences & Test Print)**:
   - The app will automatically test and verify the TCP connection handshake.
   - Look for the green **"Network Link Confirmed • Ready to Print"** badge.
   - Select your **Receipt Template** and roll width (**58mm** or **80mm**).
   - Tap **Print Test Receipt** to verify paper alignment.
   - Tap **Save & Start Printing**.

### ⚠️ Critical Network Troubleshooting (Resolving "Timed Out After 6s")
If you see `Connection timed out to printer at 192.168.1.200:9100`:
- **Turn OFF Mobile / Cellular Data:** On mobile phones and tablets, active 4G/5G mobile data causes Android/iOS to route private intranet IP requests (`192.168.x.x`) through mobile data instead of the local Wi-Fi interface. **Turn Mobile Data OFF and keep Wi-Fi ON.**
- **Check Wi-Fi Network & AP Isolation:** Ensure your phone/tablet is connected to the same router as the printer Ethernet cable. Avoid "Guest Wi-Fi" networks that have client isolation (AP isolation) enabled.
- **Single-Connection Lock:** Standard thermal printers only allow **one** active device socket at a time. Ensure no PC utility (e.g., `PRINT_SET` or diagnostic script) has the port held open. Power cycle the printer for 5 seconds to reset its listening port.

---

## 2. Bluetooth Printers (BT)

Ideal for counter tablet stands and portable handheld billing where running Ethernet cables is not feasible.

### Operating System Difference:
- **Android**: Connects via **Classic Bluetooth Serial Port Profile (SPP / RFCOMM)**. Works with virtually 100% of thermal receipt printers on the market.
- **iOS (iPhone/iPad)**: Apple restricts standard Classic Bluetooth SPP unless the printer manufacturer holds an official Apple MFi license. Standard ESC/POS Bluetooth printers will not connect on iOS via Classic SPP. For iOS, use **Wi-Fi/LAN (Port 9100)** or **BLE GATT (e.g. Epson TM-m30 / Star Micronics)**.

### Android Setup:
1. **Turn on the Printer:** Ensure the power LED is green and paper roll is loaded.
2. **Pair in Android System Settings First:**
   - Open Android **Settings** → **Connected devices** → **Bluetooth**.
   - Tap **Pair new device**.
   - Select your printer from the list (e.g., `POS-8390`, `RP-80`, `InnerPrinter`, or `BT Printer`).
   - Enter the pairing PIN (factory default is almost always **`0000`** or **`1234`**).
   - Confirm it appears under **Paired devices**.
3. **Connect in Krifoo Admin:**
   - Open **Krifoo Admin** → **Printer Settings** → **Printer Setup Wizard**.
   - Select **Bluetooth**.
   - When prompted, grant **Nearby devices** and **Location** permissions (required by Android 12+ for Bluetooth hardware scanning).
   - The app will scan and display paired thermal printers.
   - Tap **Select** on your printer.
   - Step 3 will verify the Bluetooth connection handshake pulse.
   - Tap **Print Test Receipt**, then tap **Save & Start Printing**.

### iOS Setup (BLE Printers Only):
1. Ensure the printer supports **Bluetooth Low Energy (BLE GATT)**.
2. Open **Krifoo Admin** → **Printer Setup Wizard** → **Bluetooth**.
3. Allow Bluetooth permissions when prompted by iOS.
4. Select the detected BLE thermal station from the list.

---

## 3. SUNMI POS Built-in Terminals (Android)

For all-in-one handheld POS devices and desktop terminals manufactured by SUNMI (such as Sunmi V2, V2 Pro, V2s, T2, T2 Mini, D2, K2).

### How it works:
SUNMI terminals have a direct internal thermal printer head connected via hardware bus. They do not require Bluetooth pairing, IP addresses, or network routing. Communication runs through SUNMI's high-speed AIDL printer service (`woyou.aidlservice.jiuiv5`).

### Setup Steps:
1. Open **Krifoo Admin** on your SUNMI device.
2. Navigate to **Printer Settings** → **Printer Setup Wizard**.
3. In **Step 1**, select **SUNMI Built-in Thermal Printer**.
4. The app immediately confirms: *"Built-in Sunmi printer is ready."*
5. In **Step 3**, choose your roll width (typically **58mm** for handhelds like V2/V2 Pro, or **80mm** for desktop T2).
6. Tap **Print Test Receipt** to confirm razor-sharp internal thermal printing.
7. Tap **Save & Start Printing**.

---

## 4. System Print Spooler (AirPrint & Android Print)

Used when printing to standard Wi-Fi office printers, AirPrint-certified thermal stations, or as a reliable universal fallback.

### Features:
- **iOS:** Dispatches receipt layouts through native **Apple AirPrint**.
- **Android:** Dispatches through the **Android System Print Spooler** (supporting Mopria Print Service, HP, Canon, Epson, Brother print plugins).
- Generates clean, formatted HTML receipts formatted specifically for thermal roll widths (58mm or 80mm).

### Setup Steps:
1. Ensure your printer is configured on your local network and discoverable by your phone/tablet's native print menu.
2. Open **Krifoo Admin** → **Printer Settings** → **Printer Setup Wizard**.
3. Select **System Print Spooler (AirPrint / Android)**.
4. Tap **Connect & Continue**.
5. When printing receipts or running a test print, the native iOS or Android print dialog will appear on screen, allowing you to select any system-installed printer.

---

## 5. Diagnostic & Troubleshooting Checklist

| Symptom | Root Cause | Solution |
| :--- | :--- | :--- |
| **`Connection timed out to printer at 192.168.x.x:9100`** | Mobile Data routing collision | Turn **OFF Mobile Data** on the tablet/phone so all socket traffic stays on the local Wi-Fi router. |
| **`Connection refused on port 9100`** | Another device is holding the socket open, or printer was rebooted | Power cycle the printer for 5 seconds. Thermal printers only accept 1 concurrent connection. |
| **Printer prints raw text `<epos-print>`** | Port was set to 9100 on an ePOS XML driver | For port 9100, Krifoo uses binary ESC/POS RAW (`network_raw`). Ensure port 9100 is selected and app is updated to v1.0.13+. |
| **Bluetooth scan shows "Bluetooth is disabled"** | Device Bluetooth radio is OFF | Turn on Bluetooth from Android quick settings tray or tap **Open Settings** inside the wizard. |
| **Bluetooth: "Not a POS Receipt Printer"** | Paired device is audio (headphones/speaker) | Tap **Choose Different** and select the thermal printer, not a Bluetooth speaker or headset. |
| **Blank white paper feeds out** | Paper roll inserted upside down | Open the lid and flip the thermal roll over so the thermal chemical coating faces the printhead. |
| **Cutter does not cut** | Printer does not support auto-cut or roll is 58mm without cutter | In Step 3 preferences, toggle **Auto Cut** OFF for 58mm manual tear-bar printers. |
