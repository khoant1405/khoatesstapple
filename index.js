const express = require("express");
const multer = require("multer");
const { createProxyMiddleware } = require("http-proxy-middleware");
const fs = require("fs");
const path = require("path"); // Thêm để xử lý đường dẫn file

const app = express();
const PORT = 3000; // Chuyển sang HTTP, dùng cổng 3000 (hoặc cổng khác nếu bạn muốn)

// Cấu hình Multer để lưu file trực tiếp vào thư mục trên server
const uploadDir = "uploads"; // Thư mục lưu file
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir); // Tạo thư mục nếu chưa tồn tại
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir); // Lưu file vào thư mục "uploads"
  },
  filename: (req, file, cb) => {
    const version = req.body.version;
    cb(null, `${version}.ipa`); // Đặt tên file theo version
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
  const targetPath = `distribution/ios/${fileName}`;

  // Tạo thư mục distribution/ios nếu chưa tồn tại
  const dir = "distribution/ios";
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Di chuyển file từ thư mục uploads sang distribution/ios
  fs.renameSync(req.file.path, path.join(dir, fileName));

  return res.json({ message: "Upload thành công", fileName: targetPath });
});

// 📌 API Lấy danh sách file trên server
app.get("/apps", (req, res) => {
  const dir = "distribution/ios";
  if (!fs.existsSync(dir)) {
    return res.json([]); // Trả về mảng rỗng nếu thư mục chưa tồn tại
  }

  fs.readdir(dir, (err, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Lỗi khi liệt kê file" });
    }
    const fileList = files.map((file) => ({
      name: file,
      path: `distribution/ios/${file}`,
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
  const ipaUrl = `http://localhost:${PORT}/distribution/ios/${ipaFileName}`; // URL trực tiếp trên server

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

// 📌 Serve file tĩnh từ thư mục distribution/ios
app.use("/distribution/ios", express.static("distribution/ios"));

// 📌 Khởi động HTTP Server
app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại: http://localhost:${PORT}`);
  console.log(`📦 API Upload: http://localhost:${PORT}/upload`);
  console.log(`📜 API Manifest: http://localhost:${PORT}/manifest.plist?bundleId=com.example.app&version=1.0.0&title=MyApp`);
  console.log(`🔗 Download: http://localhost:${PORT}/distribution/ios/1.0.0.ipa`);
});