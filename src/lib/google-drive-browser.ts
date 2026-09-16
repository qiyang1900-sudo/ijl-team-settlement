"use client";

export type GoogleDriveConfig = { clientId: string; apiKey: string; appId: string };
type TokenResponse = { access_token?: string; expires_in?: number; error?: string };
type PickerView = {
  setFileIds(value: string): PickerView;
  setIncludeFolders(value: boolean): PickerView;
  setSelectFolderEnabled(value: boolean): PickerView;
};
type PickerBuilder = {
  setAppId(value: string): PickerBuilder;
  setDeveloperKey(value: string): PickerBuilder;
  setOAuthToken(value: string): PickerBuilder;
  setOrigin(value: string): PickerBuilder;
  setTitle(value: string): PickerBuilder;
  addView(value: PickerView): PickerBuilder;
  setCallback(callback: (data: { action: string; docs?: { id: string }[] }) => void): PickerBuilder;
  build(): { setVisible(value: boolean): void };
};
type GoogleWindow = Window & {
  google?: {
    accounts: { oauth2: { initTokenClient(config: {
      client_id: string; scope: string; include_granted_scopes: boolean;
      callback: (response: TokenResponse) => void;
      error_callback: (error: { type: string }) => void;
    }): { requestAccessToken(options: { prompt: string }): void } } };
    picker?: { DocsView: new (view: string) => PickerView; PickerBuilder: new () => PickerBuilder; ViewId: { FOLDERS: string } };
  };
  gapi?: { load(name: string, options: { callback: () => void; onerror: () => void; timeout: number; ontimeout: () => void }): void };
};

let libraries: Promise<void> | undefined;
let access: { token: string; expiresAt: number; clientId: string } | undefined;

export function clearGoogleDriveToken() { access = undefined; }

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    const timer = window.setTimeout(() => { script.remove(); reject(new Error("Google 连接超时，请检查网络后重试。")); }, 20_000);
    script.onload = () => { window.clearTimeout(timer); resolve(); };
    script.onerror = () => { window.clearTimeout(timer); script.remove(); reject(new Error("Google 授权组件加载失败，请检查网络后重试。")); };
    document.head.appendChild(script);
  });
}

export function loadGoogleDriveLibraries() {
  libraries ??= Promise.all([
    loadScript("https://accounts.google.com/gsi/client"),
    loadScript("https://apis.google.com/js/api.js"),
  ]).then(() => new Promise<void>((resolve, reject) => {
    const gapi = (window as GoogleWindow).gapi;
    if (!gapi) return reject(new Error("Google 授权组件未加载。"));
    gapi.load("picker", { callback: resolve, onerror: () => reject(new Error("Google 文件夹选择器加载失败。")), timeout: 20_000, ontimeout: () => reject(new Error("Google 文件夹选择器加载超时。")) });
  })).catch((error) => { libraries = undefined; throw error; });
  return libraries;
}

export function requestGoogleDriveToken(clientId: string): Promise<string> {
  if (access?.clientId === clientId && access.expiresAt > Date.now() + 60_000) return Promise.resolve(access.token);
  return new Promise((resolve, reject) => {
    const oauth = (window as GoogleWindow).google?.accounts.oauth2;
    if (!oauth) return reject(new Error("Google 授权组件尚未就绪，请稍后重试。"));
    oauth.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      include_granted_scopes: false,
      callback(response) {
        if (response.error || !response.access_token) return reject(new Error("Google 授权未完成，未上传文件。"));
        access = { token: response.access_token, expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000, clientId };
        resolve(access.token);
      },
      error_callback(error) {
        reject(new Error(error.type === "popup_closed" ? "已取消 Google 连接，未上传文件。" : "无法打开 Google 授权窗口，请允许此网站弹出窗口后重试。"));
      },
    }).requestAccessToken({ prompt: "" });
  });
}

export function authorizeReportFolder(config: GoogleDriveConfig, token: string, folderId: string) {
  return new Promise<void>((resolve, reject) => {
    const picker = (window as GoogleWindow).google?.picker;
    if (!picker) return reject(new Error("Google 文件夹选择器尚未就绪。"));
    const view = new picker.DocsView(picker.ViewId.FOLDERS)
      .setFileIds(folderId).setIncludeFolders(true).setSelectFolderEnabled(true);
    new picker.PickerBuilder().setAppId(config.appId).setDeveloperKey(config.apiKey)
      .setOAuthToken(token).setOrigin(window.location.origin).setTitle("授权此战队的请求书文件夹")
      .addView(view).setCallback((data) => {
        if (data.action === "cancel") reject(new Error("已取消文件夹授权，未上传报告。"));
        if (data.action === "picked") {
          if (data.docs?.length !== 1 || data.docs[0].id !== folderId) {
            reject(new Error("选择的文件夹与此战队不一致，未上传报告。"));
          } else resolve();
        }
      }).build().setVisible(true);
  });
}
