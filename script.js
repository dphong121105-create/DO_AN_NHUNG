import { initializeApp }
from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";

import {
    getDatabase,
    ref,
    onValue,
    set
} from "https://www.gstatic.com/firebasejs/13.2.0/firebase-database.js";


const firebaseConfig = {
    apiKey: "AIzaSyC0ULoY5p63EmUHDm1M0dbNUAmNPiMNCfg",
    authDomain: "iot-nhung.firebaseapp.com",
    databaseURL: "https://iot-nhung-default-rtdb.firebaseio.com",
    projectId: "iot-nhung",
    storageBucket: "iot-nhung.firebasestorage.app",
    messagingSenderId: "333454045522",
    appId: "1:333454045522:web:b1c67aa0f3b4f754994a8b"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Đường dẫn dữ liệu SmartFarm
const dataRef = ref(database, "SmartFarm");

let latestTimestamp = null;

const ctx = document.getElementById("sensorChart");

const chart = new Chart(ctx, {
    type: "line",

    data: {
        labels: [],

        datasets: [
            {
                label: "Nhiệt độ (°C)",
                data: [],
                borderColor: "#e67e22",
                tension: 0.3
            },
            {
                label: "Độ ẩm không khí (%)",
                data: [],
                borderColor: "#3498db",
                tension: 0.3
            },
            {
                label: "Độ ẩm đất (%)",
                data: [],
                borderColor: "#27ae60",
                tension: 0.3
            }
        ]
    },

    options: {
        responsive: true,
        maintainAspectRatio: false,

        scales: {
            y: {
                beginAtZero: true
            }
        }
    }
});


function updateDevice(id, value) {

    const element = document.getElementById(id);

    const isOn =
        value === true ||
        value === 1 ||
        value === "1" ||
        String(value).toLowerCase() === "on";

    const isOff =
        value === false ||
        value === 0 ||
        value === "0" ||
        String(value).toLowerCase() === "off";

    element.className = "status";

    if (isOn) {
        element.innerText = "ĐANG BẬT";
        element.classList.add("on");
    }
    else if (isOff) {
        element.innerText = "ĐANG TẮT";
        element.classList.add("off");
    }
    else {
        element.innerText = "--";
    }
}

onValue(dataRef, (snapshot) => {

    const data = snapshot.val();

    if (!data) {
        console.log("Chưa có dữ liệu Firebase");
        return;
    }

    document.getElementById("temperature").innerText =
        data.temperature ?? "--";

    document.getElementById("humidity").innerText =
        data.humidity ?? "--";

    document.getElementById("soil").innerText =
        data.soil ?? data.soilPercent ?? "--";

    updateDevice("fanState", data.fan);
    updateDevice("motorState", data.motor);

    const timestamp = data.updatedAt ?? data.timestamp;

if (timestamp != null) {

    latestTimestamp = new Date(
        typeof timestamp === "number"
            ? (timestamp < 1e12 ? timestamp * 1000 : timestamp)
            : timestamp
    );

    document.getElementById("lastUpdate").innerText =
        latestTimestamp.toLocaleString("vi-VN");
}

    let history = data.history;

    if (history) {

        let records = Array.isArray(history)
            ? history
            : Object.values(history);

        records.sort((a, b) =>
            Number(a.timestamp || 0) - Number(b.timestamp || 0)
        );

        records = records.slice(-30);

        chart.data.labels = records.map(item => {

            const time = item.timestamp;

            if (!time) return "";

            return new Date(
                time < 1e12 ? time * 1000 : time
            ).toLocaleTimeString("vi-VN");
        });

        chart.data.datasets[0].data =
            records.map(item => item.temperature ?? null);

        chart.data.datasets[1].data =
            records.map(item => item.humidity ?? null);

        chart.data.datasets[2].data =
            records.map(item => item.soil ?? item.soilPercent ?? null);

        chart.update();
    }

    console.log("Firebase data:", data);

}, (error) => {

    console.error("Firebase error:", error);

    document.getElementById("connectionText").innerText =
        "Lỗi kết nối Firebase";

    document.getElementById("connectionDot").className =
        "offline";
});
// =====================================
// 7. CÀI ĐẶT NGƯỠNG ĐIỀU KHIỂN
// =====================================

const settingsRef = ref(database, "SmartFarm/settings");

const pumpInput = document.getElementById("pumpThreshold");
const fanInput = document.getElementById("fanThreshold");
const saveButton = document.getElementById("saveSettings");
const settingsMessage = document.getElementById("settingsMessage");

// Đọc ngưỡng đã lưu từ Firebase
onValue(settingsRef, (snapshot) => {

    const settings = snapshot.val();

    if (!settings) return;

    if (settings.pumpThreshold !== undefined) {
        pumpInput.value = settings.pumpThreshold;
    }

    if (settings.fanThreshold !== undefined) {
        fanInput.value = settings.fanThreshold;
    }

});

// Gửi ngưỡng mới lên Firebase
saveButton.addEventListener("click", async () => {

    const pumpValue = Number(pumpInput.value);
    const fanValue = Number(fanInput.value);

    if (
        pumpInput.value.trim() === "" ||
        !Number.isFinite(pumpValue) ||
        pumpValue < 0 ||
        pumpValue > 100
    ) {
        settingsMessage.innerText =
            "Ngưỡng độ ẩm đất phải từ 0 đến 100%!";
        return;
    }

    if (
        fanInput.value.trim() === "" ||
        !Number.isFinite(fanValue) ||
        fanValue < 0 ||
        fanValue > 100
    ) {
        settingsMessage.innerText =
            "Ngưỡng nhiệt độ phải từ 0 đến 100°C!";
        return;
    }

    saveButton.disabled = true;
    settingsMessage.innerText = "Đang lưu...";

    try {

        await set(settingsRef, {
    pumpThreshold: pumpValue,
    fanThreshold: fanValue
        });

        settingsMessage.innerText =
            "Đã lưu cài đặt thành công!";

    } catch (error) {

        console.error("Lỗi Firebase:", error);

        settingsMessage.innerText =
            "Lưu thất bại! Kiểm tra kết nối Firebase.";

    } finally {
        saveButton.disabled = false;
    }

});

// =====================================
// 8. KIỂM TRA ESP32 ĐỊNH KỲ
// =====================================

function checkESP32Status() {

    const now = Date.now();

    let online = false;

    if (
        latestTimestamp !== null &&
        Number.isFinite(latestTimestamp.getTime())
    ) {

        const elapsed = now - latestTimestamp.getTime();

        // ESP32 online neu cap nhat trong 20 giay gan nhat
        online = elapsed >= 0 && elapsed < 20000;
    }

    document.getElementById("espState").innerText =
        online ? "ONLINE" : "OFFLINE";

    document.getElementById("espState").className =
        online ? "status on" : "status off";

    document.getElementById("connectionText").innerText =
        online
            ? "ESP32 đang kết nối"
            : "ESP32 mất kết nối";

    document.getElementById("connectionDot").className =
        online ? "online" : "offline";
}

setInterval(checkESP32Status, 1000);

// Kiểm tra mỗi giây
setInterval(checkESP32Status, 1000);
