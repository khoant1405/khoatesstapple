const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = "uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const version = req.body.version || "default";
    cb(null, `${version}.ipa`);
  },
});
const upload = multer({ storage: storage });

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.post("/upload", upload.single("ipa"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Không có file được tải lên" });
  if (!req.body.version) return res.status(400).json({ error: "Thiếu tham số: version" });

  const version = req.body.version;
  const fileName = `${version}.ipa`;
  const targetPath = path.join("distribution", "ios", fileName);

  const dir = path.join("distribution", "ios");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    fs.renameSync(path.join(uploadDir, fileName), targetPath);
  } catch (err) {
    return res.status(500).json({ error: "Lỗi khi di chuyển file: " + err.message });
  }

  return res.json({ message: "Upload thành công", fileName: targetPath });
});

app.get("/apps", (req, res) => {
  const dir = path.join("distribution", "ios");
  if (!fs.existsSync(dir)) {
    return res.json([]);
  }

  fs.readdir(dir, (err, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Lỗi khi liệt kê file" });
    }
    const fileList = files.map((file) => ({
      name: file,
      path: path.join("/distribution/ios", file),
    }));
    res.json(fileList);
  });
});

app.get("/manifest.plist", (req, res) => {
  const { bundleId, version, title } = req.query;
  if (!bundleId || !version || !title) {
    return res.status(400).json({ error: "Thiếu tham số: bundleId, version, title" });
  }

  const ipaFileName = `${version}.ipa`;
  const ipaUrl = `https://khoatestapple.azurewebsites.net/distribution/ios/${ipaFileName}`;

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>${ipaUrl}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>${bundleId}</string>
        <key>bundle-version</key>
        <string>${version}</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>${title}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>`;

  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  res.setHeader("Content-Disposition", "inline");
  res.send(plistContent);
});

app.use("/distribution/ios", express.static(path.join("distribution", "ios")));

app.get("/", (req, res) => {
  res.send("Hello from Azure App Service!");
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server chạy tại: http://localhost:${PORT}`);
});