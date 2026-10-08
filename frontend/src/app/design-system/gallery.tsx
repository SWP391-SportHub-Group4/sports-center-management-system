"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Button,
  Drawer,
  Input,
  PageHeader,
  Select,
  Textarea,
} from "@/components/primitives";
import {
  Card,
  Dialog,
  Field,
  Loading,
  StatusChip,
  Table,
} from "@/components/ui";
import { toCheckoutViewModel } from "@/features/payments/checkout.contract";
import { Metric, MetricGrid } from "@/components/data";
import { formatMoney, formatPoints } from "@/lib/format";
import type { CheckoutDto } from "@/lib/types";

/** Fixture CÓ NHÃN — không phải dữ liệu thật. Đơn 300.000đ = 200 điểm + 100.000đ VNPay. */
const FIXTURE: CheckoutDto = {
  beneficiaryUserId: "member-demo",
  initiatorUserId: "member-demo",
  serverNowUtc: "2026-10-05T03:00:00Z",
  ptMemberPackageId: null,
  ptCoachId: null,
  ptFrequency: null,
  invoiceId: "inv-demo",
  checkoutSessionId: "cs-demo",
  revision: 3,
  kind: "CLASS",
  state: "OPEN",
  totalAmount: 300000,
  pointsApplied: 200,
  cashAmount: 100000,
  expiresAtUtc: "2026-10-05T03:15:00Z",
  resourceHoldId: "hold-demo",
  invoiceStatus: "ISSUED",
  fulfillmentOutcome: "PENDING",
  reconciliationRequired: false,
};

const SPORTS = [
  { value: "gym", label: "Gym" },
  { value: "badminton", label: "Cầu lông" },
  { value: "basketball", label: "Bóng rổ" },
];

export function DesignSystemGallery() {
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sport, setSport] = useState("");
  const checkout = toCheckoutViewModel(FIXTURE, { mode: "SELF" });
  const invalid = sport === "";

  return (
    <main
      id="main-content"
      className="content"
      tabIndex={-1}
      style={{ margin: "0 auto" }}
    >
      <PageHeader
        back={{ href: "/", label: "Trang chủ" }}
        title="Design system"
        description="Court & Volt. Các ví dụ dưới đây là cách dùng chuẩn; dùng lại, đừng tạo bản mới."
        meta={<StatusChip value="ACTIVE" />}
        actions={
          <>
            <Button variant="ghost" onClick={() => setDrawer(true)}>
              Mở Drawer
            </Button>
            <Button onClick={() => setDialog(true)}>Mở Dialog</Button>
          </>
        }
      />

      <Card
        title="MetricGrid + Metric"
        hint="Dữ liệu minh họa. Nhãn và giá trị thẳng hàng; tự chia 4, 2 hoặc 1 cột theo chiều rộng vùng chứa."
      >
        <MetricGrid>
          <Metric label="Tiền đã thu (VND)" value={formatMoney(12500000)} />
          <Metric label="Điểm đã dùng (VND)" value={formatMoney(150000)} />
          <Metric
            label="Điểm còn lại (khả dụng + đang giữ)"
            value={formatPoints(200)}
          />
          <Metric label="Hội viên mới" value={27} />
        </MetricGrid>
      </Card>

      <Card title="Button" hint="Mỗi vùng chỉ một nút primary.">
        <div className="btn-row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button
            loading={busy}
            loadingLabel="Đang xử lý"
            onClick={() => {
              setBusy(true);
              window.setTimeout(() => setBusy(false), 1600);
            }}
          >
            Loading
          </Button>
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
        </div>
      </Card>

      <Card
        title="Field + Input / Select / Textarea"
        hint="Field cấp nhãn, mô tả và lỗi; control tự nối ARIA qua context."
      >
        <div className="form-grid">
          <div className="form-grid__row" style={{ ["--span" as string]: 6 }}>
            <Field label="Họ tên" required hint="Như trên giấy tờ">
              <Input defaultValue="Nguyễn Văn A" />
            </Field>
          </div>
          <div className="form-grid__row" style={{ ["--span" as string]: 6 }}>
            <Field
              label="Môn"
              required
              error={invalid ? "Chọn một môn để tiếp tục" : undefined}
            >
              <Select
                value={sport}
                onChange={(event) => setSport(event.target.value)}
                placeholder="Chọn môn"
                options={SPORTS}
                required
              />
            </Field>
          </div>
          <div className="form-grid__row">
            <Field label="Ghi chú">
              <Textarea rows={3} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Table + StatusChip" bodyless>
        <Table
          headers={[
            "Hóa đơn",
            "Dịch vụ",
            { text: "Số tiền", numeric: true },
            "Trạng thái",
          ]}
        >
          <tr>
            <td className="mono">INV-0001</td>
            <td>Cầu lông 01 — trọn khóa</td>
            <td className="num">{formatMoney(300000)}</td>
            <td>
              <StatusChip value="PAID" />
            </td>
          </tr>
          <tr>
            <td className="mono">INV-0002</td>
            <td>Gói PT 12 buổi</td>
            <td className="num">{formatMoney(2400000)}</td>
            <td>
              <StatusChip value="ISSUED" />
            </td>
          </tr>
        </Table>
      </Card>

      <Card
        title="Trạng thái dữ liệu"
        hint="Khoa triển khai <StateView> theo components/contracts/state.ts."
      >
        <div className="stack">
          <Loading rows={2} />
          <div className="alert alert--error" role="alert">
            Không tải được hóa đơn. Thử lại sau ít phút.
          </div>
          <div className="alert alert--warn">
            Dữ liệu đã thay đổi trên máy chủ — tải lại để xem bản mới nhất.
          </div>
        </div>
      </Card>

      <Card
        title="Checkout — view-model"
        hint="Fixture có nhãn. Số tiền và điểm lấy nguyên văn từ server."
      >
        <dl className="stack" style={{ margin: 0 }}>
          <div className="row spread">
            <dt>Tổng</dt>
            <dd className="mono" style={{ margin: 0 }}>
              {formatMoney(checkout.totalAmount)}
            </dd>
          </div>
          <div className="row spread">
            <dt>Dùng điểm</dt>
            <dd className="mono" style={{ margin: 0 }}>
              {formatPoints(checkout.pointsApplied)}
            </dd>
          </div>
          <div className="row spread">
            <dt>Thanh toán VNPay</dt>
            <dd className="mono" style={{ margin: 0 }}>
              {formatMoney(checkout.cashAmount)}
            </dd>
          </div>
          <div className="row spread">
            <dt>Bước kế tiếp</dt>
            <dd style={{ margin: 0 }}>
              <StatusChip value={checkout.next} />
            </dd>
          </div>
        </dl>
      </Card>

      <p className="small muted">
        Quay lại <Link href="/">trang chủ</Link>
      </p>

      {dialog && (
        <Dialog
          title="Hủy checkout?"
          description="Chỗ giữ cho đơn này sẽ được nhả. Điểm đã giữ quay về ví."
          size="sm"
          onClose={() => setDialog(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>
                Giữ lại
              </Button>
              <Button variant="danger" onClick={() => setDialog(false)}>
                Hủy checkout
              </Button>
            </>
          }
        >
          <p>Bạn có thể đặt lại sau nếu lớp còn chỗ.</p>
        </Dialog>
      )}

      {drawer && (
        <Drawer
          title="Chi tiết buổi"
          description="Cầu lông 01 · Thứ 3, 18:00"
          onClose={() => setDrawer(false)}
          footer={<Button onClick={() => setDrawer(false)}>Đã hiểu</Button>}
        >
          <p>Drawer giữ nền phía sau để người dùng không mất ngữ cảnh lịch.</p>
        </Drawer>
      )}
    </main>
  );
}
