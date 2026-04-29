# Test Output

Thư mục này chứa log thực thi tiêu chuẩn từ hệ thống orchestration E2E.

## Mục đích

Mỗi lần chạy `./scripts/test-all.sh` hoặc `./scripts/run-all.sh test` sẽ sinh ra các file log theo schema chuẩn để phục vụ:

- Kiểm tra trạng thái CI (script `scripts/ci/scan-test-output-status.sh`)
- Truy vết kết quả E2E sau một lần deploy thực tế
- Bằng chứng kiểm thử tự động cho đồ án

## Schema chuẩn mỗi file log

```
description: <mô tả step này kiểm tra gì>
input: <lệnh chính xác được thực thi>
started_at: <UTC ISO timestamp>
output:
<toàn bộ stdout/stderr>
ended_at: <UTC ISO timestamp>
status: SUCCESS | FAILED
```

## Đặt tên file

```
test_NNN_<slug>.txt
```

| Prefix | Step |
| ------ | ---- |
| `001` | Prerequisites — cài Fabric binaries và kiểm tra tooling |
| `002` | Stack bring-up — khởi động toàn bộ Docker Compose |
| `003` | Runtime E2E — luồng API chính (create → verify → recall) |
| `004` | Geo flow E2E — timeline và heatmap endpoints |
| `005` | Transfer batch E2E — ship/receive/confirm-consumption |
| `006` | Transfer negative E2E — forbidden actors, wrong owner, idempotency |
| `007` | AI alerting E2E — AI reject, fail-open/fail-close, regulator alerts |
| `008` | Teardown — tắt stack và dọn dẹp |

## File ảnh QR thực

`real-qr/` chứa ảnh QR thực dùng để test xác thực Protected QR ngoài môi trường E2E tự động.

## Lưu ý

Log files được sinh tự động — **không chỉnh sửa thủ công**. Để tái tạo, chạy:

```bash
./scripts/test-all.sh full
```
