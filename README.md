# 🖥️ ServerStatika

ServerStatika, hafif (lightweight) Go Ajanı ile hedef sunucuların kaynak tüketimini (CPU, RAM, Disk, Süreçler) toplayan ve merkezi bir Go + SQLite sunucusunda depolayarak modern bir React Dashboard üzerinde gerçek zamanlı izlemenizi (monitoring) sağlayan modern bir altyapı izleme sistemidir.

Proje, kurumsal izleme araçlarının (Datadog, Prometheus Node Exporter vb.) kullandığı **Ajan (Agent) Mimarisi** esas alınarak geliştirilmiştir.

---

## 🏗️ Sistem Mimarisi ve Bileşenler

Sistem 3 temel bileşenden oluşur:
1. **İzleme Ajanı (`agent/`)**: İzlenecek makine üzerinde çalışan ve `gopsutil` kütüphanesi yardımıyla CPU, bellek, disk ve en çok kaynak tüketen 5 süreci (top processes) toplayıp HTTP API üzerinden merkezi sunucuya POST eden hafif Go uygulaması.
2. **Merkezi Sunucu (`backend/`)**: Ajanlardan gelen telemetry verilerini kabul eden, SQLite üzerinde zaman serisi formatında kaydeden, limit aşımlarını denetleyerek alarm fırlatan ve React arayüzünü tek bir çalıştırılabilir dosya içerisinden sunan Go sunucusu.
3. **Kullanıcı Paneli (`dashboard/`)**: Tamamen modern, karanlık mod (dark mode) ve glassmorphism temalı, 0 harici kütüphane bağımlılığı ile çizilen özel SVG grafikler barındıran React + Vite web dashboard'u.

---

## ⚙️ Kurulum ve Çalıştırma Adımları

Projeyi GitHub'dan çektikten sonra çalıştırmak için aşağıdaki adımları sırasıyla uygulayabilirsiniz:

### 1. Arayüzü Derleme (React Dashboard)
Merkezi sunucunun arayüzü gömülü (embedded) olarak sunabilmesi için öncelikle React uygulamasını derlemeniz gerekir:

```bash
# Dashboard dizinine gidin
cd dashboard

# Gerekli paketleri kurun
npm install

# Projeyi derleyin (Vite, çıktıları otomatik olarak ../backend/dist klasörüne aktaracaktır)
npm run build
```

### 2. Merkezi Sunucuyu Başlatma (Backend)
Backend sunucusu SQLite veritabanını oluşturur ve derlenmiş React dosyalarını gömülü olarak 8080 portunda yayına alır.

```bash
# Backend dizinine geçin
cd ../backend

# Sunucuyu çalıştırın
go run .
```
> **Tarayıcıdan Giriş**: Sunucu başladıktan sonra `http://localhost:8080` adresine giderek izleme panelini açabilirsiniz.

### 3. Ajanı Çalıştırma (Agent)
Ajan, izlemek istediğiniz hedef sunucu üzerinde çalışır.

*   Çalıştırmadan önce `agent/config.json` dosyasını düzenleyerek kendi sunucu isminizi, token bilginizi ve backend API adresini tanımlayabilirsiniz:
    ```json
    {
      "server_url": "http://localhost:8080",
      "server_token": "srv_my_production",
      "server_name": "Uretim Sunucusu",
      "interval_sec": 5
    }
    ```

```bash
# Agent dizinine geçin
cd ../agent

# Ajanı çalıştırın
go run .
```
Ajan çalışmaya başladığı an merkezi sunucuyla **Handshake (El Sıkışma)** gerçekleştirir, sunucuyu kaydeder ve her 5 saniyede bir telemetry verilerini göndermeye başlar.

---

## 🚨 Alarm ve Bildirim Mekanizması

Merkezi backend sunucusu, gelen metrikleri eşik değerlere göre (Örn: CPU > %90, RAM > %90, Disk > %90 veya Sunucunun 15 saniyeden uzun süre çevrimdışı kalması durumunda) sürekli denetler.

Eğer alarmları **Discord Webhook** üzerinden anlık almak isterseniz, backend sunucusunu başlatmadan önce sisteminize `DISCORD_WEBHOOK_URL` çevre değişkenini (Environment Variable) tanımlayabilirsiniz:

#### Windows (PowerShell):
```powershell
$env:DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"
go run .
```

#### Linux / macOS:
```bash
export DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN"
go run .
```

---

## 🛠️ Teknolojiler & Kütüphaneler
*   **Ajan**: Go (Golang), `github.com/shirou/gopsutil/v3` (Sistem metrikleri için cross-platform destek).
*   **Merkezi API**: Go, `modernc.org/sqlite` (Pure Go SQLite sürücüsü - CGO gerektirmez), Go 1.22+ Standard HTTP Multiplexer.
*   **Arayüz**: React (Vite), Lucide React (İkonlar), Custom CSS & SVG grafikler (Sıfır ek kütüphane yükü).
