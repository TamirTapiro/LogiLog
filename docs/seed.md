# LogiLog: Browser-Native Semantic Forensic Engine

LogiLog is a local-first, privacy-centric log analysis platform designed to run entirely in the browser via static hosting. It addresses the critical privacy and cost challenges of modern observability by performing root-cause analysis and semantic anomaly detection directly on the user's hardware.

## 1. Project Vision

The core mission of LogiLog is to provide "Software-as-a-Post"—a zero-maintenance, zero-cost-per-inference tool that users can access via a simple URL. By keeping all log data within the browser sandbox, it eliminates the risk of exposing sensitive information, such as IP addresses or credentials, to third-party cloud providers .

## 2. Technical Architecture

LogiLog leverages a modern local-compute stack to handle high-volume data without a backend server .

### 2.1 Hardware-Accelerated Inference

- **Engine:** The system uses **Transformers.js v3** with the `webgpu` backend, providing up to $100\times$ faster performance compared to standard CPU-based WebAssembly .
- **Optimization:** To fit within browser memory limits (~2GB), models are quantized to 4-bit or 8-bit integers . The linear quantization mapping is calculated as:

$$Q(W) = \text{round}\left(\frac{W}{S} + Z\right)$$

where $W$ is the weight, $S$ is the scale factor, and $Z$ is the zero-point.

- **Persistence:** Weights are cached in **IndexedDB** to reduce subsequent load times from 30 seconds to under 3 seconds .

### 2.2 High-Performance Data Handling

- **Threading:** All log parsing and model inference run in **Web Workers** using **Transferable objects** to prevent UI thread blocking .
- **Ingestion:** The **File System Access API** allows the tool to stream massive log files (up to millions of lines) without requiring a traditional "upload" step .

## 3. Core Functionalities

### 3.1 Semantic Anomaly Detection

LogiLog identifies "semantically unique" events by measuring their distance from standard logs in high-dimensional vector space . It calculates the cosine distance between the current log window ($A$) and previous patterns ($B$):

$$\text{Distance} = 1 - \frac{A \cdot B}{\|A\|\|B\|}$$

A high distance score flags an event that is contextually different from "normal" background noise, such as repetitive database timeouts or health check failures .

### 3.2 "Smart Context" Forensic Capture

When an anomaly is detected, the engine automatically extracts the "Smart Context"—identifying the 50–100 lines preceding the error to explain the failure chain in plain English .

## 4. UX/UI Requirements

- **5-Second Rule:** The UI must clearly display the "Loading," "Parsing," or "Analyzing" state within 5 seconds to manage user expectations during model compilation .
- **Timeline Visualization:** An interactive timeline should map log volumes over time, highlighting AI-detected spikes in a high-contrast terminal aesthetic .
- **Clustering View:** Group similar log entries into collapsible "patterns" to allow developers to ignore noisy, repetitive logs .

## 5. Deployment and Operations

LogiLog is designed for **GitHub Pages**, utilizing customizable Actions for automated builds . To enable WebGPU and shared memory features, the hosting environment must be configured with Cross-Origin Opener Policy (COOP) and Cross-Origin Embedder Policy (COEP) headers .

This document serves as the primary specification for the architectural, product, and design agents to execute their respective project modules.
