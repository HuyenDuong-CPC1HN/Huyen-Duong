// Giáo án học phần PDA101 · Excel nâng cao & Power Query cho dữ liệu dược. Nội dung kỹ thuật bám theo tài liệu chính
// thức của Microsoft (support.microsoft.com, learn.microsoft.com); nghiệp vụ dược bám Thông tư 36/2018/TT-BYT (GSP) và
// hướng dẫn WHO. Dữ liệu bài tập là dữ liệu kho dược giả lập (public/hoc-tap/PDA101), không phải dữ liệu thật.
// Khối nội dung: { h } tiêu đề mục · { p } đoạn văn · { ul } / { ol } danh sách · { code } công thức · { tip } mẹo ·
// { warn } lưu ý · { table: { head, rows } }. Trong chữ: **đậm**, `công thức`.

export const SOURCES = {
  tidy: { org: 'Journal of Statistical Software', title: 'Hadley Wickham (2014). Tidy Data. JSS 59(10), 1–23', url: 'https://doaj.org/article/10d611fd6e81405d8cf3f689b8dfa3a2' },
  tables: { org: 'Microsoft', title: 'Overview of Excel tables', url: 'https://support.microsoft.com/en-us/excel/overview-of-excel-tables' },
  tablesRef: { org: 'Microsoft', title: 'Using structured references with Excel tables', url: 'https://support.microsoft.com/en-us/excel/using-structured-references-with-excel-tables' },
  condFmt: { org: 'Microsoft', title: 'Use conditional formatting to highlight information in Excel', url: 'https://support.microsoft.com/en-us/excel/use-conditional-formatting-to-highlight-information-in-excel' },
  numbervalue: { org: 'Microsoft', title: 'NUMBERVALUE function', url: 'https://support.microsoft.com/en-us/office/numbervalue-function-1b05c8cf-2bfa-4437-af70-596c7ea7d879' },
  xlookup: { org: 'Microsoft', title: 'Hàm XLOOKUP (bản tiếng Việt)', url: 'https://support.microsoft.com/vi-vn/office/h%C3%A0m-xlookup-b7fd680e-6d10-43e6-84f9-88eae8bf5929' },
  sumifs: { org: 'Microsoft', title: 'SUMIFS function', url: 'https://support.microsoft.com/en-us/excel/functions/sumifs-function' },
  countifs: { org: 'Microsoft', title: 'COUNTIFS function', url: 'https://support.microsoft.com/en-us/excel/functions/countifs-function' },
  ifs: { org: 'Microsoft', title: 'IFS function', url: 'https://support.microsoft.com/en-us/excel/functions/ifs-function' },
  let: { org: 'Microsoft', title: 'LET function', url: 'https://support.microsoft.com/en-us/excel/functions/let-function' },
  iferror: { org: 'Microsoft', title: 'IFERROR function', url: 'https://support.microsoft.com/en-us/excel/functions/iferror-function' },
  lookupRef: { org: 'Microsoft', title: 'Hàm tra cứu và tham chiếu (tiếng Việt)', url: 'https://support.microsoft.com/vi-vn/excel/lookup-and-reference-functions-reference' },
  pivotCreate: { org: 'Microsoft', title: 'Create a PivotTable to analyze worksheet data', url: 'https://support.microsoft.com/en-us/excel/get-started/create-a-pivottable-to-analyze-worksheet-data' },
  pivotOverview: { org: 'Microsoft', title: 'Overview of PivotTables and PivotCharts', url: 'https://support.microsoft.com/en-us/excel/overview-of-pivottables-and-pivotcharts' },
  pqFolder: { org: 'Microsoft', title: 'Import data from a folder with multiple files (Power Query)', url: 'https://support.microsoft.com/en-us/office/import-data-from-a-folder-with-multiple-files-power-query-94b8023c-2e66-4f6b-8c78-6a00041c90e4' },
  pqCombine: { org: 'Microsoft Learn', title: 'Combine files overview – Power Query', url: 'https://learn.microsoft.com/en-us/power-query/combine-files-overview' },
  pqTypes: { org: 'Microsoft Learn', title: 'Data types in Power Query (Change type → Using locale)', url: 'https://learn.microsoft.com/en-us/power-query/data-types' },
  pqMerge: { org: 'Microsoft Learn', title: 'Merge queries overview – Power Query', url: 'https://learn.microsoft.com/en-us/power-query/merge-queries-overview' },
  pqUnpivot: { org: 'Microsoft Learn', title: 'Unpivot columns – Power Query', url: 'https://learn.microsoft.com/en-us/power-query/unpivot-column' },
  pqBest: { org: 'Microsoft Learn', title: 'Best practices when working with Power Query', url: 'https://learn.microsoft.com/en-us/power-query/best-practices' },
  gsp: { org: 'Bộ Y tế', title: 'Thông tư 36/2018/TT-BYT quy định về Thực hành tốt bảo quản thuốc, nguyên liệu làm thuốc (GSP)', url: 'https://luatvietnam.vn/y-te/thong-tu-36-2018-tt-byt-ve-thuc-hanh-tot-bao-quan-thuoc-nguyen-lieu-lam-thuoc-169783-d1.html' },
  whoGsdp: { org: 'WHO', title: 'TRS 1025 – Annex 7: Good storage and distribution practices for medical products (2020)', url: 'https://www.who.int/publications/m/item/trs-1025-annex-7' },
  whoAtc: { org: 'WHO', title: 'Hệ thống phân loại ATC/DDD (WHO Collaborating Centre for Drug Statistics Methodology)', url: 'https://atcddd.fhi.no/atc_ddd_index_and_guidelines' },
}

export const LEARN_LINKS = {
  excelHub: { org: 'Microsoft', title: 'Excel help & learning – bài viết và video hướng dẫn chính thức', url: 'https://support.microsoft.com/en-us/office/excel-video-training-9bc05390-e94c-46af-a5b3-d7c22f6990bb' },
  m365Training: { org: 'Microsoft', title: 'Microsoft 365 Training – video cơ bản', url: 'https://support.microsoft.com/en-us/training' },
  pqVideo: { org: 'Microsoft', title: 'Learn to use Power Query and Power Pivot in Excel', url: 'https://support.microsoft.com/en-us/office/learn-to-use-power-query-and-power-pivot-in-excel-42d895c2-d1d7-41d0-88da-d1ed7ecc102d' },
}

const SEPARATOR_WARN = { warn: 'Máy cài vùng **Tiếng Việt** thường dùng dấu **chấm phẩy** để ngăn cách đối số: `=SUMIFS(A:A;B:B;"X")` thay vì `=SUMIFS(A:A,B:B,"X")`. Công thức trong bài viết theo dấu phẩy; nếu Excel báo lỗi công thức, anh đổi dấu phẩy ngăn cách đối số thành chấm phẩy.' }

export const PDA101_LESSONS = {
  'BT-101.1': {
    title: 'Chuẩn hoá dữ liệu kho với Excel Table',
    time: 'Nửa tuần · đọc giáo án 60–90 phút, thực hành 3–5 giờ',
    objectives: [
      'Nhận biết 6 lỗi dữ liệu thường gặp khi xuất file từ phần mềm kho.',
      'Đưa dữ liệu về dạng bảng chuẩn và tạo Excel Table có tên.',
      'Chuyển chữ thành ngày và thành số đúng quy ước Việt Nam ("1.500,000" → 1500).',
      'Tính số ngày còn hạn và tô màu cảnh báo cận date bằng định dạng có điều kiện.',
    ],
    blocks: [
      { h: '1. Thế nào là dữ liệu "sạch"?' },
      { p: 'Theo bài báo kinh điển **"Tidy Data"** (Hadley Wickham, Journal of Statistical Software, 2014), một bảng dữ liệu dễ phân tích phải theo 3 nguyên tắc:' },
      { ol: ['**Mỗi biến là 1 cột** (Mã hàng, Số lô, Hạn dùng, Số lượng… mỗi thứ 1 cột riêng).', '**Mỗi quan sát là 1 dòng** (1 dòng = 1 lô hàng trên 1 phiếu xuất).', '**Mỗi loại đối tượng là 1 bảng** (bảng xuất kho riêng, danh mục hàng hoá riêng).'] },
      { p: 'File xuất từ phần mềm kho thường vi phạm các nguyên tắc này. 6 lỗi hay gặp:' },
      { table: { head: ['Lỗi', 'Ví dụ trong file bài tập', 'Cách xử lý'], rows: [
        ['Dòng trống', 'Dòng không có dữ liệu giữa bảng', 'Lọc (Blanks) rồi xoá'],
        ['Dòng tiêu đề lặp lại', 'Giữa bảng có dòng "Ngày | Số phiếu | …"', 'Lọc cột Ngày = "Ngày" rồi xoá'],
        ['Dòng trùng lặp hoàn toàn', 'Một dòng xuất bị ghi 2 lần', 'Data › Remove Duplicates'],
        ['Mã hàng lẫn khoảng trắng, chữ thường', '"P10015 ", "p10003"', '`UPPER(TRIM(…))`'],
        ['2 thông tin trong 1 ô', '"011126 - 25/01/2027" (Lô + Hạn dùng)', 'Tách thành 2 cột'],
        ['Số, ngày lưu dạng chữ', '"1.500,000"; "24.11.28"', '`NUMBERVALUE`, `DATE`'],
      ] } },
      { tip: 'Luôn **giữ nguyên sheet dữ liệu gốc**, chép sang sheet mới rồi mới làm sạch. Khi có sai sót anh còn đối chiếu lại được.' },

      { h: '2. Excel Table – nền móng của mọi báo cáo' },
      { p: 'Excel Table (trước đây gọi là Excel list) gom dữ liệu liên quan thành 1 khối để quản lý và phân tích (Microsoft). Cách tạo: chọn 1 ô trong vùng dữ liệu › **Insert › Table** (hoặc Ctrl + T) › tích **My table has headers**.' },
      { ul: [
        '**Đặt tên bảng** có ý nghĩa ở Table Design › Table Name, ví dụ `tblXuatKho` (Microsoft khuyên dùng tên mô tả thay cho "Table1").',
        '**Tự mở rộng:** thêm dòng mới ngay dưới bảng là bảng tự nhận, công thức và định dạng tự áp dụng.',
        '**Tham chiếu có cấu trúc:** viết `=[@[Số lượng]]*2` thay vì `=G2*2`, đọc là hiểu.',
        '**Total Row** dùng hàm SUBTOTAL, tự bỏ qua các dòng đang bị lọc ẩn.',
      ] },

      { h: '3. Dọn dòng rác' },
      { ol: [
        'Bật bộ lọc cột **Ngày** › chỉ tích **(Blanks)** › chọn các dòng hiện ra › xoá dòng. Làm tương tự với giá trị "Ngày" (dòng tiêu đề lặp).',
        'Xoá bộ lọc › **Data › Remove Duplicates** › chọn tất cả các cột › OK. Excel báo đã xoá bao nhiêu dòng trùng, anh ghi lại con số này.',
      ] },

      { h: '4. Chuẩn hoá mã hàng' },
      { code: '=UPPER(TRIM([@[Mã hàng]]))' },
      { p: '`TRIM` bỏ khoảng trắng thừa, `UPPER` đổi thành chữ hoa. Tạo cột mới bằng công thức, kiểm tra xong thì **Copy › Paste Values** đè lên cột cũ rồi xoá cột phụ.' },

      { h: '5. Tách Lô và Hạn dùng' },
      { p: 'Cách 1 (nhanh): chọn cột › **Data › Text to Columns** › Delimited › Other: gõ dấu `-` › Finish, rồi xoá khoảng trắng bằng TRIM. Cách 2 (công thức, Excel 365):' },
      { code: 'Số lô:      =TRIM(TEXTBEFORE([@[Lô - Hạn dùng]]," - "))\nHạn (chữ):  =TRIM(TEXTAFTER([@[Lô - Hạn dùng]]," - "))' },
      { p: 'Excel đời cũ chưa có TEXTBEFORE/TEXTAFTER thì dùng `=LEFT(F2,FIND(" - ",F2)-1)` và `=MID(F2,FIND(" - ",F2)+3,20)`.' },

      { h: '6. Chuyển hạn dùng từ chữ sang ngày' },
      { p: 'Excel lưu ngày dưới dạng **số sê-ri**, chỉ khi là ngày thật mới tính được "còn bao nhiêu ngày". File có 3 kiểu viết: `25/01/2027`, `2027-01-25`, `24.11.28`. Không nên dùng DATEVALUE vì kết quả phụ thuộc thiết lập vùng (Region) của từng máy. Dùng hàm **DATE(năm, tháng, ngày)** cắt từng phần cho chắc:' },
      { code: '=LET(t, [@[Hạn (chữ)]],\n  IFS(MID(t,5,1)="-", DATE(LEFT(t,4), MID(t,6,2), RIGHT(t,2)),\n      MID(t,3,1)=".", DATE(2000+RIGHT(t,2), MID(t,4,2), LEFT(t,2)),\n      TRUE,           DATE(RIGHT(t,4), MID(t,4,2), LEFT(t,2))))' },
      { p: 'Đọc công thức: nếu ký tự thứ 5 là "-" thì đó là kiểu năm-tháng-ngày; nếu ký tự thứ 3 là "." thì là kiểu ngày.tháng.năm 2 số; còn lại là ngày/tháng/năm. `LET` và `IFS` sẽ học kỹ ở tuần 2; tuần này anh chỉ cần hiểu ý tưởng và dùng được. Định dạng cột kết quả là `dd/mm/yyyy`.' },

      { h: '7. Chuyển số lượng dạng chữ "1.500,000" thành số' },
      { p: 'Phiếu in theo quy ước Việt Nam: **dấu chấm ngăn cách hàng nghìn, dấu phẩy là phần thập phân**. "1.500,000" = 1500; "30,000" = 30. Hàm **NUMBERVALUE** đổi chữ thành số không phụ thuộc thiết lập vùng của máy, ví dụ chính thức của Microsoft: `NUMBERVALUE("2.500,27",",",".")` = 2500,27.' },
      { code: '=NUMBERVALUE([@[Số lượng]], ",", ".")' },
      { warn: 'Đây đúng là lỗi mà AI đọc phiếu từng mắc khi đọc "30,000" thành 30.000. Dữ liệu sai đơn vị là lỗi nguy hiểm nhất vì nhìn vẫn "hợp lý". Sau khi đổi, anh lọc thử các số lượng lớn bất thường để kiểm tra.' },

      { h: '8. Số ngày còn hạn và mức cảnh báo' },
      { code: 'Còn hạn (ngày): =[@[Hạn dùng]] - DATE(2026,10,31)\nMức cảnh báo:   =IFS([@[Còn hạn (ngày)]]<0,"Hết hạn",\n                     [@[Còn hạn (ngày)]]<180,"Dưới 6 tháng",\n                     [@[Còn hạn (ngày)]]<365,"Dưới 12 tháng",\n                     TRUE,"Bình thường")' },
      { p: 'Bài tập dùng ngày cố định 31/10/2026 để ai làm cũng ra cùng kết quả. Khi làm báo cáo thật, thay bằng `TODAY()`.' },

      { h: '9. Tô màu cảnh báo bằng định dạng có điều kiện' },
      { p: 'Chọn toàn bộ vùng dữ liệu của bảng (từ dòng 2) › **Home › Conditional Formatting › New Rule › Use a formula to determine which cells to format**. Theo thứ tự cột ở bài tập, "Còn hạn (ngày)" là cột J:' },
      { code: 'Đỏ (dưới 6 tháng):    =$J2<180\nVàng (6–12 tháng):    =AND($J2>=180,$J2<365)' },
      { tip: 'Ô quy tắc định dạng không nhận tham chiếu có cấu trúc kiểu `[@[…]]`. Hãy dùng địa chỉ ô, **khoá cột bằng dấu $** (`$J2`) để cả dòng được tô màu.' },
      SEPARATOR_WARN,
    ],
    business: {
      title: 'Liên hệ nghiệp vụ: quản lý hạn dùng theo GSP',
      text: [
        '**Thông tư 36/2018/TT-BYT** của Bộ Y tế về Thực hành tốt bảo quản thuốc, nguyên liệu làm thuốc (GSP), ban hành 22/11/2018, hiệu lực từ 10/01/2019, quy định thuốc được cấp phát theo nguyên tắc **"Hết hạn trước xuất trước" (FEFO)** hoặc **"Nhập trước xuất trước" (FIFO)**. Câu chữ này trích từ Phụ lục IV; anh đối chiếu phụ lục áp dụng cho loại cơ sở của mình.',
        'Hướng dẫn của WHO về thực hành tốt bảo quản và phân phối (TRS 1025, Phụ lục 7, 2020) cũng yêu cầu luân chuyển tồn kho phù hợp.',
        'Báo cáo theo lô – hạn dùng mà anh làm trong bài này chính là công cụ để thực hiện FEFO: biết lô nào sắp hết hạn để ưu tiên xuất trước, hoặc báo kinh doanh, nhà máy xử lý sớm.',
        '**Lưu ý:** mốc cảnh báo 6 tháng và 12 tháng là **quy ước quản lý nội bộ** phổ biến, không phải con số của Thông tư. Anh áp dụng theo quy định của đơn vị mình.',
      ],
      sources: ['gsp', 'whoGsdp'],
    },
    selfCheck: [
      { q: 'Vì sao không nên để Lô và Hạn dùng chung 1 ô?', a: 'Vi phạm nguyên tắc "mỗi biến 1 cột": không lọc, sắp xếp hay tính số ngày còn hạn theo hạn dùng được.' },
      { q: '"1.500,000" trên phiếu là bao nhiêu? Dùng công thức nào để đổi?', a: '1500. Dùng `=NUMBERVALUE(ô, ",", ".")`: dấu phẩy là phần thập phân, dấu chấm ngăn cách hàng nghìn.' },
      { q: 'Vì sao dùng DATE thay vì DATEVALUE để đổi hạn dùng?', a: 'DATEVALUE hiểu chuỗi ngày theo thiết lập vùng của máy, máy khác có thể hiểu sai ngày/tháng. DATE lấy đúng năm, tháng, ngày do mình chỉ định.' },
      { q: 'Thêm 10 dòng mới ngay dưới Excel Table thì chuyện gì xảy ra?', a: 'Bảng tự mở rộng; công thức cột và định dạng tự áp dụng cho dòng mới; PivotTable dựa trên bảng chỉ cần Refresh là nhận.' },
      { q: 'Trong quy tắc định dạng có điều kiện, vì sao viết `$J2` mà không phải `J2`?', a: 'Khoá cột J để mọi ô trên cùng dòng đều xét giá trị cột J, nhờ vậy tô màu được cả dòng.' },
    ],
    assignment: {
      file: { label: 'BT-101.1_XuatKho_T10_2026.xlsx', url: '/hoc-tap/PDA101/BT-101.1_XuatKho_T10_2026.xlsx' },
      brief: 'Anh nhận được file xuất kho tháng 10/2026 xuất thô từ phần mềm (dữ liệu giả lập). Hãy làm sạch và lập danh sách cảnh báo cận date tính đến ngày 31/10/2026.',
      steps: [
        'Giữ nguyên sheet gốc; chép dữ liệu sang sheet mới tên "Sach".',
        'Xoá dòng trống, dòng tiêu đề lặp, dòng trùng. Ghi lại số dòng đã xoá của từng loại.',
        'Tạo Excel Table tên `tblXuatKho` gồm các cột: Ngày (kiểu ngày), Số phiếu, Mã hàng (đã chuẩn hoá), Tên hàng, ĐVT, Số lô, Hạn dùng (kiểu ngày), Số lượng (kiểu số), Khách hàng.',
        'Thêm 2 cột "Còn hạn (ngày)" và "Mức cảnh báo" (Hết hạn / Dưới 6 tháng / Dưới 12 tháng / Bình thường).',
        'Tô đỏ các dòng dưới 180 ngày, tô vàng các dòng 180–364 ngày.',
        'Viết 3–5 dòng nhận xét: có bao nhiêu dòng xuất thuộc lô dưới 6 tháng; mặt hàng nào xuất nhiều lô cận date; đề xuất hành động (theo FEFO, báo kinh doanh…).',
      ],
      submit: [
        'File Excel đã làm (đính kèm, hoặc chụp màn hình bảng kết quả).',
        'Số dòng còn lại sau khi làm sạch; số dòng đã xoá của từng loại lỗi.',
        'Số dòng ở từng mức cảnh báo.',
        'Phần nhận xét nghiệp vụ.',
      ],
      rubric: [
        ['Kết quả đúng', 4, 'Đủ dòng sạch, không sót dòng rác; ngày và số đúng kiểu; số ngày còn hạn và mức cảnh báo chính xác'],
        ['Phương pháp', 2, 'Dùng Excel Table và công thức (không gõ tay); công thức đổi ngày, số dùng được cho cả file'],
        ['Trình bày', 2, 'Tên cột rõ, định dạng ngày dd/mm/yyyy, tô màu đúng quy tắc'],
        ['Nhận xét nghiệp vụ', 2, 'Rút ra được việc cần làm theo FEFO và cận date, có số liệu dẫn chứng'],
      ],
    },
    sources: ['tidy', 'tables', 'tablesRef', 'numbervalue', 'ifs', 'condFmt'],
    learn: ['excelHub', 'm365Training'],
  },

  'BT-101.2': {
    title: 'Tra cứu và đối chiếu chứng từ: XLOOKUP, SUMIFS, COUNTIFS, IFS, LET',
    time: 'Nửa tuần · đọc giáo án 60–90 phút, thực hành 3–5 giờ',
    objectives: [
      'Tạo khoá đối chiếu Mã hàng + Số lô, chuẩn hoá lô có đuôi nội bộ.',
      'Dùng XLOOKUP để tra cứu, biết khi nào XLOOKUP không đủ và phải dùng SUMIFS.',
      'Dùng COUNTIFS để kiểm tra "có hay không", IFS và LET để tự động kết luận Khớp / Thiếu / Thừa / Lệch lô.',
      'Lập bảng tổng hợp sai lệch và nội dung báo nhà máy.',
    ],
    blocks: [
      { h: '1. Bài toán đối chiếu' },
      { p: 'Hai nguồn: **sổ sách** (Phiếu xuất kho của nhà máy) và **thực tế** (số kho đếm khi nhận). Mỗi dòng hàng xác định bằng **Mã hàng + Số lô**. Có 6 kết luận có thể xảy ra:' },
      { table: { head: ['Kết luận', 'Ý nghĩa'], rows: [
        ['Khớp', 'Cùng mã, cùng lô, thực nhận = sổ sách'],
        ['Thiếu', 'Thực nhận ít hơn phiếu'],
        ['Thừa', 'Thực nhận nhiều hơn phiếu'],
        ['Lệch lô', 'Có mã hàng nhưng lô thực nhận khác lô trên phiếu'],
        ['Không nhận được', 'Có trên phiếu nhưng kho không nhận được mặt hàng đó'],
        ['Không có trên phiếu', 'Kho nhận được nhưng phiếu không ghi'],
      ] } },

      { h: '2. Khoá đối chiếu và chuẩn hoá lô' },
      { code: 'Lô chuẩn:  =SUBSTITUTE([@[Số lô]], ".SDKM", "")\nKhoá:      =[@[Mã hàng]] & "|" & [@[Lô chuẩn]]' },
      { p: 'Dấu "|" ngăn giữa 2 phần để tránh trùng ngẫu nhiên (ví dụ "P1"&"23" và "P12"&"3" đều ra "P123"). Đuôi ".SDKM" là **ký hiệu nội bộ** của kho: phần lô phía trước khớp thì là cùng lô, không phải lệch lô.' },

      { h: '3. XLOOKUP – tra cứu 1 giá trị' },
      { code: '=XLOOKUP(lookup_value, lookup_array, return_array, [if_not_found], [match_mode], [search_mode])' },
      { p: 'Theo Microsoft: XLOOKUP tìm trong một vùng và trả về giá trị ở **dòng khớp đầu tiên**; mặc định **khớp chính xác**; tìm được cả bên trái lẫn bên phải (khác VLOOKUP chỉ tìm sang phải và phải đếm số cột). Ví dụ lấy hạn dùng thực nhận theo khoá:' },
      { code: '=XLOOKUP([@Khoá], tblThucNhan[Khoá], tblThucNhan[Hạn dùng], "Không có")' },
      { warn: '**XLOOKUP chỉ lấy dòng khớp đầu tiên.** Nếu 1 lô được kiểm 2 lần (2 dòng thực nhận cùng khoá), XLOOKUP chỉ lấy 1 dòng nên ra thiếu sai. Muốn cộng số lượng phải dùng **SUMIFS**. Trong file bài tập có cài sẵn tình huống này.' },
      { p: 'XLOOKUP có trong Microsoft 365 và Excel 2021 trở lên. Excel 2016/2019 thì dùng `INDEX` + `MATCH` (xem trang "Hàm tra cứu và tham chiếu" của Microsoft).' },

      { h: '4. SUMIFS – cộng có điều kiện' },
      { code: '=SUMIFS(tblThucNhan[Số lượng thực nhận], tblThucNhan[Khoá], [@Khoá])' },
      { p: 'Microsoft lưu ý: **thứ tự đối số của SUMIFS khác SUMIF**, vùng cần cộng (sum_range) đứng **đầu tiên**, sau đó mới là các cặp vùng điều kiện / điều kiện (tối đa 127 cặp).' },

      { h: '5. COUNTIFS – kiểm tra "có hay không"' },
      { code: 'Có đúng khoá (mã + lô)?   =COUNTIFS(tblThucNhan[Khoá], [@Khoá])\nCó mã hàng (lô bất kỳ)?   =COUNTIFS(tblThucNhan[Mã hàng], [@[Mã hàng]])' },
      { p: 'Kết quả 0 nghĩa là không có. COUNTIFS đếm số dòng thoả **tất cả** điều kiện; các vùng điều kiện phải cùng kích thước (Microsoft). Điều kiện dùng được ký tự đại diện: `*` thay nhiều ký tự, `?` thay 1 ký tự.' },

      { h: '6. IFS và LET – tự động kết luận' },
      { p: '**IFS** kiểm tra lần lượt các điều kiện và trả về giá trị của điều kiện **đúng đầu tiên**; điều kiện cuối `TRUE` đóng vai "còn lại". **LET** đặt tên cho các kết quả trung gian để công thức dễ đọc, và mỗi biểu thức chỉ tính 1 lần (Microsoft).' },
      { code: '=LET(sl,    [@[Số lượng (sổ sách)]],\n     tn,    [@[Thực nhận]],\n     coMa,  COUNTIFS(tblThucNhan[Mã hàng], [@[Mã hàng]]),\n     coKhoa,COUNTIFS(tblThucNhan[Khoá], [@Khoá]),\n     IFS(coMa=0,   "Không nhận được",\n         coKhoa=0, "Lệch lô",\n         tn<sl,    "Thiếu " & sl-tn,\n         tn>sl,    "Thừa " & tn-sl,\n         TRUE,     "Khớp"))' },
      { tip: 'Thứ tự điều kiện rất quan trọng: phải xét "không có mã" và "lệch lô" **trước** khi so số lượng. Nếu đặt sai thứ tự, dòng lệch lô sẽ bị kết luận nhầm là "Thiếu".' },

      { h: '7. Chiều ngược lại: hàng nhận được nhưng phiếu không ghi' },
      { p: 'Trên bảng thực nhận, kiểm tra từng dòng có trên phiếu không:' },
      { code: '=IFS(COUNTIFS(tblPXK[Khoá], [@Khoá])>0,       "Có trên phiếu",\n     COUNTIFS(tblPXK[Mã hàng], [@[Mã hàng]])>0, "Lệch lô (lô thực nhận)",\n     TRUE,                                     "Không có trên phiếu")' },

      { h: '8. IFERROR và if_not_found – đừng che lỗi thật' },
      { p: '**IFERROR** trả về giá trị anh chọn khi công thức lỗi (#N/A, #VALUE!, #REF!, #DIV/0!…). Với XLOOKUP, nên dùng đối số **if_not_found** vì nó chỉ xử lý trường hợp "không tìm thấy". IFERROR bọc ngoài cả công thức sẽ che luôn các lỗi khác (gõ sai tên bảng, sai kiểu dữ liệu), làm anh không phát hiện ra.' },

      { h: '9. Bảng tổng hợp' },
      { code: 'Số dòng Khớp:   =COUNTIFS(tblPXK[Kết luận], "Khớp")\nSố dòng Thiếu:  =COUNTIFS(tblPXK[Kết luận], "Thiếu*")' },
      { p: 'Dấu `*` trong "Thiếu*" bắt mọi kết luận bắt đầu bằng "Thiếu" (ví dụ "Thiếu 20").' },
      SEPARATOR_WARN,
    ],
    business: {
      title: 'Liên hệ nghiệp vụ: kiểm nhận hàng và báo sai lệch',
      text: [
        'Khi nhận hàng, kho kiểm tra **số lượng, số lô, hạn dùng** so với chứng từ. Mọi sai lệch phải được ghi nhận và thông báo cho nơi giao hàng: nhà máy, nhà cung cấp.',
        'Đây là một phần của kiểm soát chất lượng trong suốt quá trình bảo quản mà GSP (Thông tư 36/2018/TT-BYT) và hướng dẫn của WHO đặt ra.',
        'Đối chiếu bằng công thức giúp **không bỏ sót** và **lưu lại bằng chứng**. Bảng tổng hợp sai lệch chính là nội dung "báo đầu nguồn" anh vẫn gửi qua Zalo.',
        'Quy ước bỏ đuôi ".SDKM" là quy ước nội bộ của kho. Gặp đuôi lạ khác, anh hỏi lại trước khi coi là cùng lô.',
      ],
      sources: ['gsp', 'whoGsdp'],
    },
    selfCheck: [
      { q: 'Một lô được kiểm 2 lần (2 dòng thực nhận 1.160 và 40). XLOOKUP trả về bao nhiêu? Nên dùng hàm nào?', a: 'XLOOKUP chỉ trả về dòng khớp đầu tiên (1.160). Phải dùng SUMIFS để cộng ra 1.200.' },
      { q: 'Trong SUMIFS, đối số nào đứng đầu?', a: 'Vùng cần cộng (sum_range). SUMIF thì ngược lại, vùng cộng đứng cuối. Microsoft lưu ý riêng điểm này.' },
      { q: 'Vì sao khoá cần dấu ngăn cách "|"?', a: 'Để tránh 2 cặp mã + lô khác nhau ghép thành cùng một chuỗi.' },
      { q: 'Vì sao trong IFS phải xét "Lệch lô" trước "Thiếu"?', a: 'IFS dừng ở điều kiện đúng đầu tiên. Dòng lệch lô có thực nhận theo khoá = 0, nếu xét "Thiếu" trước sẽ bị kết luận nhầm là thiếu toàn bộ.' },
      { q: 'Máy anh dùng Excel 2016, không có XLOOKUP. Thay bằng gì?', a: 'INDEX + MATCH, ví dụ `=INDEX(cột_trả_về, MATCH(giá_trị, cột_tìm, 0))`.' },
    ],
    assignment: {
      file: { label: 'BT-101.2_DoiChieu_PXK_ThucNhan.xlsx', url: '/hoc-tap/PDA101/BT-101.2_DoiChieu_PXK_ThucNhan.xlsx' },
      brief: 'Đối chiếu Phiếu xuất kho của nhà máy (sheet PXK) với số thực nhận tại kho (sheet ThucNhan). Dữ liệu giả lập có cài sẵn các tình huống: thiếu, thừa, lệch lô, lô có đuôi nội bộ .SDKM, một mặt hàng được kiểm 2 lần, hàng không nhận được, hàng nhận được nhưng phiếu không ghi.',
      steps: [
        'Định dạng 2 vùng dữ liệu thành Excel Table: `tblPXK` và `tblThucNhan`.',
        'Thêm cột "Lô chuẩn" (bỏ đuôi .SDKM) và "Khoá" cho cả 2 bảng.',
        'Trên tblPXK thêm cột: Thực nhận (SUMIFS), Chênh lệch, Kết luận (LET + IFS).',
        'Trên tblThucNhan thêm cột phân loại: Có trên phiếu / Lệch lô (lô thực nhận) / Không có trên phiếu.',
        'Lập bảng tổng hợp số dòng theo từng kết luận (COUNTIFS).',
        'Soạn nội dung báo nhà máy (5–8 dòng): liệt kê số phiếu, mã hàng, lô, chênh lệch cụ thể.',
      ],
      submit: [
        'File Excel (hoặc ảnh chụp 2 bảng và bảng tổng hợp).',
        'Số dòng theo từng kết luận.',
        'Nội dung báo nhà máy.',
      ],
      rubric: [
        ['Kết quả đúng', 4, 'Kết luận đúng cho mọi dòng, kể cả lô .SDKM (không phải lệch lô) và mặt hàng kiểm 2 lần (cộng đúng)'],
        ['Phương pháp', 2, 'Dùng khoá + SUMIFS/COUNTIFS, công thức LET + IFS rõ ràng; không xử lý tay từng dòng'],
        ['Trình bày', 2, 'Bảng tổng hợp gọn, tô màu hoặc lọc được theo kết luận'],
        ['Nhận xét nghiệp vụ', 2, 'Nội dung báo nhà máy đủ thông tin để đối chiếu (số phiếu, mã, lô, số lượng)'],
      ],
    },
    sources: ['xlookup', 'lookupRef', 'sumifs', 'countifs', 'ifs', 'let', 'iferror'],
    learn: ['excelHub'],
  },

  'BT-101.3': {
    title: 'PivotTable: báo cáo nhập – xuất – tồn',
    time: 'Nửa tuần · đọc giáo án 60–90 phút, thực hành 3–5 giờ',
    objectives: [
      'Chuẩn bị dữ liệu đúng chuẩn cho PivotTable.',
      'Tạo PivotTable theo tháng, nhà máy, nhóm ATC; nhóm ngày theo tháng/quý; hiển thị tỉ trọng %.',
      'Lọc Top 10, dùng Slicer và Timeline, vẽ PivotChart.',
      'Tính tồn cuối kỳ và rút ra nhận xét quản lý.',
    ],
    blocks: [
      { h: '1. Khi nào dùng PivotTable' },
      { p: 'PivotTable tóm tắt nhanh dữ liệu lớn theo nhiều chiều (tháng, nhà máy, nhóm thuốc…) mà không cần viết công thức. Theo Microsoft, dữ liệu nguồn cần: **dạng bảng, không có dòng hoặc cột trống, tiêu đề nằm ở 1 dòng**. Nên dùng **Excel Table** làm nguồn, vì dòng thêm vào bảng sẽ tự được tính khi **Refresh**.' },

      { h: '2. Tạo PivotTable và 4 vùng' },
      { p: '**Insert › PivotTable › From Table/Range** › New Worksheet. Kéo trường vào 4 vùng:' },
      { table: { head: ['Vùng', 'Vai trò', 'Ví dụ'], rows: [
        ['Rows', 'Nhóm theo dòng', 'Tháng, Tên hàng'],
        ['Columns', 'Nhóm theo cột', 'Loại (Nhập/Xuất)'],
        ['Values', 'Con số cần tính', 'Sum of Số lượng, Sum of Giá trị'],
        ['Filters', 'Lọc toàn báo cáo', 'Nhà máy'],
      ] } },
      { warn: 'Trường số mặc định tính **Sum**. Nếu Excel hiện **Count** thay vì Sum, nghĩa là cột đó đang lưu số dạng chữ (Microsoft). Đây là dấu hiệu dữ liệu chưa sạch, quay lại kỹ thuật tuần 1.' },

      { h: '3. Nhóm ngày theo tháng, quý' },
      { p: 'Đặt trường Ngày vào Rows › chuột phải vào một ngày › **Group** › chọn **Months** (và **Quarters**) › OK.' },

      { h: '4. Tỉ trọng % và sắp xếp' },
      { p: 'Chuột phải vào số trong Values › **Show Values As › % of Grand Total** để xem mỗi nhà máy, nhóm ATC chiếm bao nhiêu phần trăm. Sắp xếp: chuột phải › Sort › Largest to Smallest.' },

      { h: '5. Top 10 mặt hàng xuất' },
      { p: 'Rows: Tên hàng · Filters: Loại = Xuất · Values: Sum of Số lượng. Bấm mũi tên lọc ở Row Labels › **Value Filters › Top 10** › chọn theo Sum of Số lượng. Làm thêm bản Top 10 theo **Giá trị** rồi so sánh: hàng xuất nhiều nhất chưa chắc là hàng có giá trị lớn nhất.' },

      { h: '6. Slicer, Timeline và PivotChart' },
      { ul: [
        '**PivotTable Analyze › Insert Slicer**: tạo nút bấm lọc theo Nhóm ATC, Nhà máy.',
        '**Insert Timeline**: thanh trượt lọc theo thời gian (trường Ngày).',
        '**PivotChart**: biểu đồ gắn với PivotTable, lọc ở Slicer thì biểu đồ đổi theo. Dùng biểu đồ cột hoặc đường cho số liệu theo tháng.',
      ] },

      { h: '7. Tồn cuối kỳ' },
      { p: 'Công thức tồn kho cơ bản: **Tồn cuối kỳ = Tồn đầu kỳ + Nhập trong kỳ − Xuất trong kỳ**. Lập bảng theo mã hàng bằng kỹ thuật tuần 2:' },
      { code: 'Nhập:      =SUMIFS(tblGiaoDich[Số lượng], tblGiaoDich[Mã hàng], [@[Mã hàng]], tblGiaoDich[Loại], "Nhập")\nXuất:      =SUMIFS(tblGiaoDich[Số lượng], tblGiaoDich[Mã hàng], [@[Mã hàng]], tblGiaoDich[Loại], "Xuất")\nTồn cuối:  =[@[Tồn đầu kỳ 01/07/2026]] + [@Nhập] - [@Xuất]' },
      { tip: 'Tồn cuối **âm** là dấu hiệu dữ liệu sai: thiếu chứng từ nhập, nhập sai mã, hoặc tồn đầu kỳ chưa đúng. Báo cáo tốt phải chỉ ra được những dòng này.' },

      { h: '8. Làm mới dữ liệu' },
      { p: 'Khi dữ liệu nguồn thay đổi, phải bấm **PivotTable Analyze › Refresh** (hoặc Data › Refresh All) thì PivotTable mới cập nhật (Microsoft).' },
      SEPARATOR_WARN,
    ],
    business: {
      title: 'Liên hệ nghiệp vụ: báo cáo nhập – xuất – tồn và nhóm ATC',
      text: [
        'Báo cáo nhập – xuất – tồn là báo cáo cơ bản nhất của kho. Tách theo nhà máy giúp phòng kế hoạch biết nguồn hàng nào cần đặt thêm.',
        'Nhóm thuốc trong file theo **hệ thống phân loại ATC của WHO** (cấp 1: A – Tiêu hoá và chuyển hoá, C – Tim mạch, J – Chống nhiễm khuẩn…). Đây cũng là cách dữ liệu thị trường dược (IQVIA) phân nhóm, anh sẽ gặp lại ở PDA105.',
        'Top 10 mặt hàng theo giá trị là bước đầu của **phân tích ABC** (học kỹ ở PDA106): một số ít mặt hàng thường chiếm phần lớn giá trị, cần được kiểm soát chặt nhất.',
      ],
      sources: ['whoAtc'],
    },
    selfCheck: [
      { q: 'Kéo cột Số lượng vào Values mà ra "Count of Số lượng". Nguyên nhân?', a: 'Cột đang chứa số dạng chữ, hoặc có ô chữ lẫn vào. Cần làm sạch về kiểu số rồi Refresh.' },
      { q: 'Vì sao nên dùng Excel Table làm nguồn PivotTable?', a: 'Dòng thêm vào bảng tự được tính khi Refresh, không phải chọn lại vùng nguồn.' },
      { q: 'Làm sao xem mỗi nhà máy chiếm bao nhiêu % tổng giá trị xuất?', a: 'Show Values As › % of Grand Total (hoặc % of Column Total tuỳ bố cục).' },
      { q: 'Tồn cuối kỳ âm nói lên điều gì?', a: 'Dữ liệu có vấn đề: thiếu phiếu nhập, sai mã hàng hoặc tồn đầu kỳ chưa đúng. Phải kiểm tra lại chứng từ.' },
    ],
    assignment: {
      file: { label: 'BT-101.3_NhapXuat_Q3_2026.xlsx', url: '/hoc-tap/PDA101/BT-101.3_NhapXuat_Q3_2026.xlsx' },
      brief: 'Từ dữ liệu giao dịch nhập – xuất quý 3/2026 (giả lập), lập bộ báo cáo cho Giám đốc chi nhánh.',
      steps: [
        'Chuyển dữ liệu thành Excel Table `tblGiaoDich`.',
        'PivotTable 1: Nhập và Xuất theo tháng (nhóm ngày theo Months).',
        'PivotTable 2: Giá trị xuất theo Nhà máy × Nhóm ATC, hiển thị % tổng.',
        'PivotTable 3: Top 10 mặt hàng xuất theo số lượng và Top 10 theo giá trị (2 bảng).',
        'Thêm Slicer (Nhóm ATC, Nhà máy), Timeline (Ngày) và 1 PivotChart theo tháng.',
        'Bảng tồn cuối kỳ 30/09/2026 theo mã hàng (Tồn đầu + Nhập − Xuất); đánh dấu dòng tồn âm nếu có.',
        'Nhận xét 5 dòng: tháng xuất cao nhất; nhà máy và nhóm ATC chiếm tỉ trọng lớn nhất; top 10 chiếm bao nhiêu % giá trị; mặt hàng tồn thấp cần lưu ý.',
      ],
      submit: ['File Excel (hoặc ảnh chụp các PivotTable và biểu đồ).', '5 dòng nhận xét có số liệu.'],
      rubric: [
        ['Kết quả đúng', 4, 'Số liệu PivotTable và tồn cuối kỳ chính xác; Top 10 đúng tiêu chí'],
        ['Phương pháp', 2, 'Nguồn là Excel Table, nhóm ngày đúng cách, dùng Show Values As thay vì tính tay'],
        ['Trình bày', 2, 'Báo cáo gọn, có Slicer/Timeline, biểu đồ đúng loại và có tiêu đề'],
        ['Nhận xét nghiệp vụ', 2, 'Nhận xét có số liệu và gợi ý hành động cho kế hoạch nhập hàng'],
      ],
    },
    sources: ['pivotCreate', 'pivotOverview', 'sumifs', 'whoAtc'],
    learn: ['excelHub'],
  },

  'BT-101.4': {
    title: 'Power Query: tự động gộp file và làm mới báo cáo',
    time: 'Nửa tuần · đọc giáo án 60–90 phút, thực hành 3–5 giờ',
    objectives: [
      'Hiểu Power Query: mỗi thao tác được ghi thành 1 bước và tự chạy lại khi Refresh.',
      'Gộp nhiều file cùng cấu trúc trong 1 thư mục.',
      'Đổi kiểu dữ liệu theo vùng Việt Nam; ghép bảng (Merge) với danh mục; xoay bảng ngang thành dọc (Unpivot).',
      'Thêm file tháng mới và bấm Refresh All để toàn bộ báo cáo tự cập nhật.',
    ],
    blocks: [
      { h: '1. Power Query là gì' },
      { p: 'Power Query là công cụ **lấy và biến đổi dữ liệu** có sẵn trong Excel (thẻ **Data › Get & Transform Data**). Mỗi thao tác anh làm (xoá cột, đổi kiểu, lọc…) được ghi thành 1 bước trong **Applied Steps**. Tháng sau có dữ liệu mới, anh chỉ cần **Refresh**, không phải làm lại từ đầu.' },

      { h: '2. Gộp nhiều file trong 1 thư mục' },
      { ol: [
        'Giải nén file bài tập; để 3 file tháng 7, 8, 9 trong **1 thư mục riêng** (không để file khác lẫn vào).',
        '**Data › Get Data › From File › From Folder** › chọn thư mục.',
        'Bấm **Combine › Combine & Transform Data** › chọn sheet mẫu (XuatKho) › OK.',
        'Power Query tạo bảng gộp, có cột **Source.Name** cho biết mỗi dòng đến từ file nào.',
      ] },
      { warn: 'Theo Microsoft, các file phải **cùng cấu trúc**: cùng tên cột, kiểu dữ liệu, số cột. Thư mục chỉ nên chứa đúng các file cần gộp, vì mọi file trong thư mục (và thư mục con được chọn) đều bị gộp vào.' },

      { h: '3. Đổi kiểu dữ liệu theo vùng Việt Nam' },
      { p: 'Power Query đoán kiểu dữ liệu theo thiết lập vùng của máy, nên có thể hiểu sai ngày "05/07/2026" (5 tháng 7 hay 7 tháng 5?). Cách làm đúng theo Microsoft Learn: chuột phải tiêu đề cột › **Change Type › Using Locale…** › chọn kiểu (Date / Decimal Number) và **Locale: Vietnamese (Vietnam)**.' },

      { h: '4. Ghép danh mục hàng hoá (Merge Queries)' },
      { ol: [
        'Nạp file DanhMuc_HangHoa.xlsx thành 1 query riêng (Get Data › From Workbook).',
        'Chọn query xuất kho › **Home › Merge Queries** › chọn cột **Mã hàng** ở cả 2 bảng.',
        '**Join Kind: Left Outer** (giữ mọi dòng xuất, lấy thêm thông tin từ danh mục) › OK.',
        'Bấm biểu tượng mở rộng ở cột mới › chọn Tên hàng, Nhóm ATC, Nhà máy, Đơn giá.',
      ] },
      { tip: 'Cột dùng để ghép ở 2 bảng phải **cùng kiểu dữ liệu**, nếu không kết quả ghép có thể sai (Microsoft Learn). Muốn tìm mã xuất kho không có trong danh mục, dùng Join Kind **Left Anti**.' },

      { h: '5. Xoay bảng ngang thành dọc (Unpivot)' },
      { p: 'File kế hoạch để mỗi tháng 1 cột (dạng ngang): khó lọc, khó ghép. Chọn cột **Mã hàng** › **Transform › Unpivot Other Columns** để được 3 cột: Mã hàng, Attribute (Tháng), Value (Kế hoạch). Microsoft Learn khuyên dùng **Unpivot Other Columns** khi sau này có thể thêm cột tháng mới, vì cột mới cũng tự được xoay khi Refresh.' },

      { h: '6. Thêm cột tính toán' },
      { code: 'Add Column › Custom Column:\n  Giá trị = [Số lượng] * [Đơn giá]\n  Tháng   = Date.Month([Ngày])' },

      { h: '7. Đưa kết quả ra Excel và làm mới' },
      { ul: [
        '**Home › Close & Load To…** › chọn Table hoặc PivotTable Report.',
        'Khi có file tháng mới: chép vào thư mục › **Data › Refresh All**. Mọi query và PivotTable tự cập nhật.',
        'Đặt tên query rõ ràng (qXuatKho, qDanhMuc, qKeHoach); không sửa tay trên bảng kết quả, vì Refresh sẽ ghi đè.',
      ] },
      { tip: 'Tính năng gộp thư mục chạy ổn định nhất trên **Excel cho Windows**. Anh nên làm bài này trên máy Windows.' },
    ],
    business: {
      title: 'Liên hệ nghiệp vụ: báo cáo định kỳ và truy xuất nguồn gốc',
      text: [
        'Báo cáo tuần, tháng cho lãnh đạo là việc lặp lại: Power Query biến việc 1–2 giờ thành 1 lần bấm Refresh và giảm lỗi thao tác tay.',
        'Cột Source.Name cho biết mỗi dòng đến từ file nào. Đây là thói quen **truy xuất nguồn gốc dữ liệu**, rất quan trọng khi có sai lệch cần đối chiếu lại chứng từ gốc.',
        'So sánh thực xuất với kế hoạch theo mã và tháng (% hoàn thành kế hoạch) là bước chuẩn bị cho phần dự báo nhu cầu ở PDA106.',
      ],
      sources: [],
    },
    selfCheck: [
      { q: 'Thư mục gộp lỡ có thêm 1 file Excel khác cấu trúc. Chuyện gì xảy ra?', a: 'Power Query vẫn gộp file đó nên có thể lỗi hoặc ra dữ liệu sai. Thư mục chỉ nên chứa các file cùng cấu trúc.' },
      { q: 'Vì sao nên dùng "Change Type › Using Locale" với dữ liệu Việt Nam?', a: 'Để Power Query hiểu đúng ngày (ngày/tháng/năm) và số (phẩy thập phân) theo vùng Việt Nam, không phụ thuộc thiết lập của máy.' },
      { q: 'Left Outer và Left Anti khác nhau thế nào?', a: 'Left Outer giữ mọi dòng bảng trái và ghép thêm thông tin khớp. Left Anti chỉ giữ những dòng bảng trái không khớp được, dùng để tìm mã không có trong danh mục.' },
      { q: 'Vì sao chọn "Unpivot Other Columns" thay vì "Unpivot Columns"?', a: 'Khi thêm cột tháng mới, Unpivot Other Columns tự xoay cả cột mới khi Refresh; Unpivot Columns chỉ xoay các cột đã chọn lúc đầu.' },
    ],
    assignment: {
      file: { label: 'BT-101.4_PowerQuery.zip', url: '/hoc-tap/PDA101/BT-101.4_PowerQuery.zip' },
      brief: 'Xây báo cáo xuất kho tự động cập nhật từ thư mục file tháng (giả lập), so sánh với kế hoạch.',
      steps: [
        'Gộp 3 file tháng 7–9 trong thư mục bằng From Folder; đổi kiểu Ngày, Số lượng theo vùng Vietnamese (Vietnam).',
        'Merge với danh mục để có Tên hàng, Nhóm ATC, Nhà máy, Đơn giá; thêm cột Giá trị và Tháng.',
        'Load ra PivotTable: giá trị xuất theo Tháng × Nhóm ATC.',
        'Unpivot file kế hoạch; ghép với thực xuất theo Mã hàng + Tháng; tính % hoàn thành kế hoạch.',
        'Chép file tháng 10 vào thư mục, bấm Refresh All; chụp màn hình trước và sau khi làm mới.',
        'Nhận xét 3–5 dòng: mặt hàng vượt hoặc chưa đạt kế hoạch; nhóm ATC tăng hoặc giảm theo tháng.',
      ],
      submit: ['File Excel có các query (hoặc ảnh chụp Applied Steps của từng query).', 'Ảnh chụp trước và sau khi thêm tháng 10 + Refresh.', 'Phần nhận xét.'],
      rubric: [
        ['Kết quả đúng', 4, 'Gộp đủ các tháng; ghép danh mục đúng; % kế hoạch đúng; Refresh nhận tháng 10'],
        ['Phương pháp', 2, 'Mọi bước làm trong Power Query (không sửa tay); đổi kiểu theo locale; dùng Unpivot Other Columns'],
        ['Trình bày', 2, 'Tên query rõ ràng, báo cáo gọn, có ảnh chứng minh làm mới tự động'],
        ['Nhận xét nghiệp vụ', 2, 'Nhận xét so sánh kế hoạch – thực tế có số liệu và đề xuất'],
      ],
    },
    sources: ['pqFolder', 'pqCombine', 'pqTypes', 'pqMerge', 'pqUnpivot', 'pqBest'],
    learn: ['pqVideo', 'excelHub'],
  },
}

// Lịch học gợi ý mỗi tuần ở Giai đoạn 1 (3 tháng): khoảng 15 giờ, 2 bài/tuần.
export const WEEK_PLAN = [
  ['Thứ 2', 'Đọc giáo án bài 1 của tuần, làm theo các ví dụ', '1,5–2 giờ'],
  ['Thứ 3', 'Làm bài tập bài 1', '1,5–2 giờ'],
  ['Thứ 4', 'Hoàn thành và nộp bài 1; đọc giáo án bài 2', '1,5–2 giờ'],
  ['Thứ 5 – Thứ 6', 'Câu hỏi tự kiểm tra, tài liệu gốc; hỏi giảng viên chỗ chưa hiểu', '2 × 1,5 giờ'],
  ['Thứ 7 / Chủ nhật', 'Làm bài tập bài 2', '4–5 giờ'],
  ['Chủ nhật tối', 'Nộp bài 2, ghi điểm vào tab', '15 phút'],
]
