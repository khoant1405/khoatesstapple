const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os"); // Thêm để lấy thư mục tạm thời

const app = express();

// Sử dụng thư mục tạm thời của Azure App Service
const tempDir = process.env.WEBSITES_TEMP_DIR || os.tmpdir(); // Dùng /tmp trên Azure
const uploadDir = path.join(tempDir, "uploads");
const distributionDir = path.join(tempDir, "distribution", "ios");

// Tạo thư mục uploads nếu chưa tồn tại
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Tạo thư mục distribution/ios nếu chưa tồn tại
if (!fs.existsSync(distributionDir)) {
  fs.mkdirSync(distributionDir, { recursive: true });
}

// Cấu hình Multer để lưu file vào thư mục tạm thời
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

// Middleware CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// 📌 API Upload file IPA trực tiếp vào server
app.post("/upload", upload.single("ipa"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Không có file được tải lên" });
  if (!req.body.version) return res.status(400).json({ error: "Thiếu tham số: version" });

  const version = req.body.version;
  const fileName = `${version}.ipa`;
  const targetPath = path.join(distributionDir, fileName);

  try {
    fs.renameSync(path.join(uploadDir, fileName), targetPath);
  } catch (err) {
    return res.status(500).json({ error: "Lỗi khi di chuyển file: " + err.message });
  }

  return res.json({ message: "Upload thành công", fileName: path.join("distribution", "ios", fileName) });
});

// 📌 API Lấy danh sách file trên server
app.get("/apps", (req, res) => {
  if (!fs.existsSync(distributionDir)) {
    return res.json([]);
  }

  fs.readdir(distributionDir, (err, files) => {
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

// 📌 API Tạo `manifest.plist` để cài đặt OTA trên iOS
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

// 📌 Serve file tĩnh từ thư mục distribution/ios trong thư mục tạm thời
app.use("/distribution/ios", express.static(distributionDir));

// 📌 Thêm route mặc định để kiểm tra
app.get("/", (req, res) => {
  res.send("Hello from Azure App Service!");
});

// 📌 Khởi động server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server chạy tại: http://localhost:${PORT}`);
});