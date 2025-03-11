const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();

// Sử dụng thư mục gốc của Azure App Service
const uploadDir = path.join("/home/site/wwwroot", "uploads");
const distributionDir = path.join("/home/site/wwwroot", "distribution", "ios");

let finalUploadDir = uploadDir;
let finalDistributionDir = distributionDir;

// Tạo thư mục uploads nếu chưa tồn tại
if (!fs.existsSync(uploadDir)) {
  console.log(`Creating directory: ${uploadDir}`);
  fs.mkdirSync(uploadDir, { recursive: true });
} else {
  console.log(`Directory exists: ${uploadDir}`);
}

// Tạo thư mục distribution/ios nếu chưa tồn tại
if (!fs.existsSync(distributionDir)) {
  console.log(`Creating directory: ${distributionDir}`);
  fs.mkdirSync(distributionDir, { recursive: true });
} else {
  console.log(`Directory exists: ${distributionDir}`);
}

// Cấu hình Multer để lưu file vào thư mục uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const absUploadDir = path.resolve(finalUploadDir);
    console.log(`Multer destination: ${absUploadDir}`);
    if (!fs.existsSync(absUploadDir)) {
      console.log(`Creating Multer destination: ${absUploadDir}`);
      fs.mkdirSync(absUploadDir, { recursive: true });
    }
    cb(null, absUploadDir);
  },
  filename: (req, file, cb) => {
    const version = req.body.version || "default";
    const fileName = `${version}.ipa`;
    console.log(`Saving file as: ${fileName}`);
    cb(null, fileName);
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
  console.log("Upload request received");
  console.log(`Request body: ${JSON.stringify(req.body)}`);
  console.log(`File received: ${req.file ? JSON.stringify(req.file) : "No file"}`);

  if (!req.file) {
    console.log("No file uploaded");
    return res.status(400).json({ error: "Không có file được tải lên" });
  }
  if (!req.body.version) {
    console.log("No version provided");
    return res.status(400).json({ error: "Thiếu tham số: version" });
  }

  const version = req.body.version;
  const fileName = `${version}.ipa`;
  const sourcePath = path.join(finalUploadDir, fileName);
  const targetPath = path.join(finalDistributionDir, fileName);

  console.log(`Source path: ${sourcePath}`);
  console.log(`Target path: ${targetPath}`);
  console.log(`File exists at source? ${fs.existsSync(sourcePath)}`);

  try {
    if (!fs.existsSync(sourcePath)) {
      throw new Error("File not found at source path");
    }
    fs.renameSync(sourcePath, targetPath);
    console.log(`File moved successfully to ${targetPath}`);
  } catch (err) {
    console.error(`Error moving file: ${err.message}`);
    return res.status(500).json({ error: "Lỗi khi di chuyển file: " + err.message });
  }

  return res.json({ message: "Upload thành công", fileName: path.join("distribution", "ios", fileName) });
});

// 📌 API Lấy danh sách file trên server
app.get("/apps", (req, res) => {
  if (!fs.existsSync(finalDistributionDir)) {
    console.log(`Directory not found: ${finalDistributionDir}`);
    return res.json([]);
  }

  fs.readdir(finalDistributionDir, (err, files) => {
    if (err) {
      console.error(`Error reading directory ${finalDistributionDir}: ${err.message}`);
      return res.status(500).json({ error: "Lỗi khi liệt kê file" });
    }
    const fileList = files.map((file) => ({
      name: file,
      path: path.join("/distribution/ios", file),
    }));
    console.log(`Found files: ${JSON.stringify(fileList)}`);
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

// 📌 Serve file tĩnh từ thư mục distribution/ios
app.use("/distribution/ios", express.static(finalDistributionDir));

// 📌 Thêm route mặc định để kiểm tra
app.get("/", (req, res) => {
  res.send("Hello from Azure App Service!");
});

// 📌 Khởi động server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server chạy tại: http://localhost:${PORT}`);
});