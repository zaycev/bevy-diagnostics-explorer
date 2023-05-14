import * as vscode from "vscode";
import fetch, { Response, Blob } from "node-fetch";
import { HelpDataProvider } from "./treeViewHelp";
import {
  EcsSystemsProvider,
  Span,
  EcsSpanDiagnosticProps,
  addDuration,
} from "./treeViewDiagnostics";
import { decodeBlobV1 } from "./dataFormatV1";

const API_ENDPOINT = "http://localhost:5444/v1/spans";

const formatBytes = (bytes: number, decimals = 2): string => {
  if (bytes === 0) return "0b";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["b", "kb", "mb", "gb"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

export function activate(context: vscode.ExtensionContext) {
  // Register tree view;
  const ecsSystems = new EcsSystemsProvider();
  const viewDiag = vscode.window.createTreeView("viewDiagnostics", {
    treeDataProvider: ecsSystems,
  });
  const viewHelp = vscode.window.createTreeView("viewHelp", {
    treeDataProvider: new HelpDataProvider(),
  });

  context.subscriptions.push(viewDiag);
  context.subscriptions.push(viewHelp);

  // Set status bar item.
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    Number.MIN_SAFE_INTEGER
  );
  statusBarItem.text = "$(sync~spin) Bevy: Initializing...";
  statusBarItem.show();

  // Poll http server periodically.
  let connected = false;
  let lastPollTime = new Date();

  const interval = setInterval(async () => {
    // Call agent's endpoint.
    let resp: Response;
    try {
      resp = await fetch(API_ENDPOINT, { method: "GET" });
    } catch (e) {
      statusBarItem.text = "$(close) Bevy: Not running";
      return;
    }

    if (resp.status !== 200) {
      statusBarItem.text = "$(close) Bevy: Failed to connect";
      return;
    }

    const raw = await resp.arrayBuffer();

    // Calculate bps.
    const now = new Date();
    const sinceLastPollSec = (now.getTime() - lastPollTime.getTime()) / 1000;
    const sinceLastPollBytes = raw.byteLength;
    const sinceLastPollBps = sinceLastPollBytes / sinceLastPollSec;
    lastPollTime = now;

    statusBarItem.text = `$(arrow-both) Bevy: ${formatBytes(
      sinceLastPollBps,
      2
    )}/s`;
    connected = true;

    // Update tree view.
    ecsSystems.ecsSpans = decodeBlobV1(raw);
    ecsSystems.refresh();
  }, 300);
}

export function deactivate() {}
