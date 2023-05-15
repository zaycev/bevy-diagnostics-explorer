import * as vscode from "vscode";

export class HelpDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  getTreeItem(
    element: vscode.TreeItem
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }
  getChildren(
    element?: vscode.TreeItem | undefined
  ): vscode.ProviderResult<vscode.TreeItem[]> {
    // Add a links to the discord server, github, and twitter

    const discordItem = new vscode.TreeItem(
      "Join Discord Server",
      vscode.TreeItemCollapsibleState.None
    );
    discordItem.iconPath = new vscode.ThemeIcon("comment-discussion");
    discordItem.command = {
      command: "vscode.open",
      title: "Open Discord Server",
      arguments: [vscode.Uri.parse("https://discord.gg/J4vdsnadnh")],
    };

    const githubItem = new vscode.TreeItem(
      "Source Code & Docs",
      vscode.TreeItemCollapsibleState.None
    );
    githubItem.iconPath = new vscode.ThemeIcon("github-inverted");
    githubItem.command = {
      command: "vscode.open",
      title: "Open Github",
      arguments: [
        vscode.Uri.parse("https://github.com/zaycev/bevy-diagnostics-explorer"),
      ],
    };

    const twitterItem = new vscode.TreeItem(
      "Ping me on Twitter",
      vscode.TreeItemCollapsibleState.None
    );
    twitterItem.iconPath = new vscode.ThemeIcon("remote-explorer-feedback");
    twitterItem.command = {
      command: "vscode.open",
      title: "Open Twitter",
      arguments: [vscode.Uri.parse("https://twitter.com/xyzw_io")],
    };

    return [discordItem, githubItem, twitterItem];
  }
}
