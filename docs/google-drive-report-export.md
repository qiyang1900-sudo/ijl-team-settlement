# 结案报告直接导出到 Google 网盘

## 本次范围

- 保留原来的本地 Excel 下载，两个入口共用同一个模板生成器。
- 仅管理员可导出审核通过的项目。
- 使用现有八个战队的请求书文件夹，不修改请求书上传方式或文件夹权限。
- 文件名沿用本地导出名称，包含战队与项目名称。
- 同一项目、同一战队重复导出会更新同一个文件，不创建副本。
- 导出记录与审核状态分开，上传不会触发 Discord 催交。

## 按项目批量导出

项目管理的「查看进度」页面提供「一键导出到 Google 网盘」。
每次执行前重新读取该项目的参与战队与审核状态，只处理已通过记录。
浏览器使用一次 Google 登录逐队调用原有导出接口，各队仍存入自己的请求书文件夹。
首次遇到尚未授权的文件夹会显示对应选择器，确认后自动继续。

页面显示每队成功、失败、跳过或等待授权的状态，以及报告和文件夹链接。
单队失败不会影响其他队；登录过期则暂停余下任务。
「停止后续导出」会等待当前战队结束后停止；「重试未完成」重新检查审核状态并保留本轮成功结果。
执行期间需保持页面打开；关闭后可再次执行，服务端的固定文件编号仍会避免重复文件。
不增加数据库表或环境变量，也不修改审核、请求书或 Discord 逻辑。

## Google 首次配置

1. 在 Google Cloud 创建或选择一个项目，启用 Google Drive API 和 Google Picker API。
2. 在 Google Auth Platform 设置应用名称、支持邮箱和使用者；测试期间加入负责导出的管理员账号。
3. 创建 Web application 类型的 OAuth 客户端。
   - Authorized JavaScript origins 加入正式站点：
     `https://team-settlement-system.vercel.app`
   - 本地测试可另加 `http://localhost:3000`；预览部署需添加具体预览域名。
   - 这里使用浏览器 token 模式，不需要客户端密钥，也不需要 redirect URI。
4. 创建 API key，只允许 Google Picker API，并用 HTTP referrer 限制为以上站点。
5. 在 Vercel 配置以下三项后重新部署：

| 环境变量 | 内容 |
| --- | --- |
| `GOOGLE_DRIVE_CLIENT_ID` | 上述 Web OAuth Client ID |
| `GOOGLE_PICKER_API_KEY` | 限定站点和 Picker API 的 API key |
| `GOOGLE_CLOUD_PROJECT_NUMBER` | Google Cloud 项目数字编号，不是项目名称或 ID |

这三项会用于浏览器端，不能放入 OAuth Client Secret。不要把密码、refresh token 或客户端密钥放入这些变量。

6. 在 Supabase 执行 `supabase/project-report-drive-exports.sql`。
   该表启用 RLS，仅服务端可读写，不保存 Google token。
7. 管理员打开已通过项目的提交详情，点击「导出到 Google 网盘」。
   首次会出现 Google 登录授权；如需授权目标文件夹，选择器只展示该战队的固定请求书文件夹。

## 权限与保存规则

OAuth 只请求 `https://www.googleapis.com/auth/drive.file`，不请求访问整个网盘。
管理员账号必须对对应文件夹有添加文件的权限。
访问 token 仅保存在当前页面内存中，通过 HTTPS 交给服务端完成本次上传，
不写入数据库、localStorage、日志或导出记录。过期后需再次点击并完成 Google 授权。
这不是无人值守的后台自动归档功能。

普通共享文件夹的新文件归实际上传的 Google 账号所有，消耗该账号的额度。
网站当前通过固定战队映射选定目标，不接受客户端任意传入其他文件夹。
新导出的文件将继承现有文件夹的分享权限；本功能不更改它们。

上传前在数据库预留 Google 文件编号。网络中断后重试仍用同一编号。
重复导出会校验文件的所属项目、目标文件夹与文件类型，只更新本功能自己创建的文件。
上传成功后会重新读取 Google 文件并核对 MD5 完整性。
原文件已删除、移动或无权限时会停止并显示具体原因，不覆盖请求书、不自动创建额外副本。
实际上传成功但网站记录写入失败时，会显示警告和网盘文件链接。

## 验收

- 本地 Excel 与网盘上传必须使用相同文件名、工作表、截图扩展列和金额计算。
- 8 个战队必须各自落入正确文件夹，不可串队。
- 连续两次导出只存在一个报告文件。
- 未审核通过、未登录、跨站请求、只读文件夹及数据库错误均不上传。
- 测试 Google 授权取消、过期、存储满、超时以及上传后记录写入失败。
- 审核状态、请求书文件、Discord 提醒逻辑保持不变。

## 参考

- [Google token 模式](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Google Picker](https://developers.google.com/workspace/drive/picker/guides/overview)
- [指定 Picker 文件夹](https://developers.google.com/workspace/drive/picker/reference/picker.docsview.setfileids)
- [Google Drive 文件上传](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
