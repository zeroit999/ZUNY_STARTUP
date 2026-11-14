import {useEffect,useMemo,useRef,useState} from 'react';
import ojApi from '../../services/ojApi.js';
import JSZip from 'jszip';

const DRAFT_KEY='zuny:oj:problem-editor:draft:v1';
const readDraft=()=>{
  try {
    const raw=sessionStorage.getItem(DRAFT_KEY);
    return raw?JSON.parse(raw):null;
  } catch {
    return null;
  }
};
const initial={code:'',name:'',time_limit:1,memory_limit:256,points:1,partial:true,source:'',group:'Chưa phân loại',types:'',description:'',is_public:false,submission_source_visibility_mode:'default',testcase_visibility_mode:'default',testers:'',statement_file:null};
const initialData={zip_filename:'',grader:'standard',io_method:'standard',io_input_file:'',io_output_file:'',checker:'standard',checker_args:'',checker_type:'testlib',output_limit:-1,custom_grader:null,custom_checker:null,zipfile:null};
const cls='w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500';
const primary='rounded-xl bg-[#3157d5] px-4 py-2.5 text-xs font-extrabold text-white hover:bg-indigo-700';
const Field=({title,children,note})=><label className="block text-xs font-bold text-slate-600"><span className="mb-2 block">{title}</span>{children}{note&&<span className="mt-1 block text-[11px] font-normal text-slate-400">{note}</span>}</label>;
const Section=({title,description,children})=><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5"><h2 className="font-extrabold text-slate-800">{title}</h2>{description&&<p className="mt-1 text-xs text-slate-400">{description}</p>}</div>{children}</section>;
const makeCase=(n)=>({id:crypto.randomUUID(),order:n,type:'normal',input_file:'',output_file:'',points:1,is_pretest:false,checker:'',checker_args:'',generator_args:'',deleted:false});
function TestDataEditor({data,setData,cases,setCases,zipFiles,setZipFiles,notice,setNotice,onCasesImported}){const inputRef=useRef(null);
const update=(key,value)=>setData(d=>({...d,[key]:value}));const patch=(id,key,value)=>setCases(list=>list.map(c=>c.id===id?{...c,[key]:value}:c));const add=(at)=>setCases(list=>{const next=[...list];next.splice(at,0,makeCase(at+1));return next.map((c,i)=>({...c,order:i+1}));});
const onZip=async(e)=>{
  const file=e.target.files?.[0];
  if(!file)return;

  const MAX_ZIP_BYTES=200*1024*1024;
  const MAX_TOTAL_BYTES=500*1024*1024;
  const MAX_FILE_BYTES=100*1024*1024;
  const MAX_FILES=2000;

  if(!/\.zip$/i.test(file.name)){
    setNotice('Vui lòng chọn tệp ZIP hợp lệ.');
    return;
  }
  if(file.size>MAX_ZIP_BYTES){
    setNotice('ZIP vượt quá giới hạn 200 MB.');
    return;
  }

  try{
    setNotice('Đang kiểm tra và giải nén testcase...');

    const zip=await JSZip.loadAsync(file,{
      checkCRC32:true,
      createFolders:false
    });

    const entries=Object.values(zip.files).filter(entry=>!entry.dir);

    if(entries.length===0||entries.length>MAX_FILES){
      throw new Error('ZIP phải có từ 1 đến 2000 tệp.');
    }

    const files=new Map();
    let totalBytes=0;

    for(const entry of entries){
      const name=entry.name.replace(/\\/g,'/');

      if(
        name.startsWith('/')||
        name.split('/').includes('..')||
        /^[a-zA-Z]:/.test(name)
      ){
        throw new Error('ZIP chứa đường dẫn không an toàn.');
      }

      if(!/\.(in|inp|out|ans)$/i.test(name))continue;

      const bytes=await entry.async('uint8array');

      if(bytes.byteLength>MAX_FILE_BYTES){
        throw new Error(`Tệp ${name} vượt quá 100 MB.`);
      }

      totalBytes+=bytes.byteLength;

      if(totalBytes>MAX_TOTAL_BYTES){
        throw new Error('Tổng dữ liệu testcase vượt quá 500 MB.');
      }

      const key=name.toLowerCase();

      if(files.has(key)){
        throw new Error(`Tên tệp bị trùng: ${name}`);
      }

      files.set(key,{
        name,
        text:new TextDecoder('utf-8',{fatal:true}).decode(bytes)
      });
    }

    const inputs=[...files.values()]
      .filter(entry=>/\.(in|inp)$/i.test(entry.name));

    if(!inputs.length){
      throw new Error('Không tìm thấy tệp input .in hoặc .inp.');
    }

    const matches=[];
    const missing=[];

    for(const input of inputs){
      const base=input.name.replace(/\.(in|inp)$/i,'');
      const output=files.get(`${base}.out`.toLowerCase())
        ||files.get(`${base}.ans`.toLowerCase());

      if(!output){
        missing.push(input.name);
        continue;
      }

      matches.push({
        ...makeCase(matches.length+1),
        input_file:input.name,
        output_file:output.name,
        input_content:input.text,
        output_content:output.text
      });
    }

    if(missing.length){
      throw new Error(
        `Thiếu output cho ${missing.length} input: `+
        missing.slice(0,5).join(', ')
      );
    }

    if(!matches.length){
      throw new Error('Không tìm thấy cặp input/output hợp lệ.');
    }

    onCasesImported();
    setZipFiles([...files.values()].map(entry=>entry.name));
    setCases(matches);
    setData(previous=>({...previous,zipfile:null,zip_filename:file.name}));

    setNotice('Đọc testcase thành công');
  }catch(error){
    setNotice(`Không thể nhập ZIP: ${error.message}`);
  }finally{
    if(inputRef.current)inputRef.current.value='';
  }
};

const total=useMemo(()=>cases.filter(c=>!c.deleted&&c.type==='normal').reduce((sum,c)=>sum+(Number(c.points)||0),0),[cases]);
return <div className="space-y-5"><Section title="Cấu hình dữ liệu chấm" description="Thiết lập cách chấm và nạp dữ liệu kiểm thử cho bài toán."><div className="grid gap-4 lg:grid-cols-2"><Field title="Tệp dữ liệu ZIP"><label className="flex w-full cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 hover:border-indigo-400">
  <span className="min-w-0 truncate">
    {data.zip_filename || 'Chọn tệp ZIP'}
  </span>
  <input ref={inputRef} className="sr-only" type="file" accept=".zip,application/zip" onChange={onZip}/></label></Field><Field title="Bộ chấm bài (Grader)"><select className={cls} value={data.grader} onChange={e=>update('grader',e.target.value)}><option value="standard">Mặc định (Standard)</option><option value="signature">Hàm / Signature</option><option value="output_only">Chỉ nộp kết quả (Output only)</option><option value="custom">Trình chấm ngoài</option></select></Field>{data.grader==='standard'&&<Field title="Phương thức nhập/xuất"><select className={cls} value={data.io_method} onChange={e=>update('io_method',e.target.value)}><option value="standard">Đầu vào/ra chuẩn (stdin/stdout)</option><option value="file">Sử dụng file</option></select></Field>}{data.grader==='standard'&&data.io_method==='file'&&<><Field title="Tên file đầu vào"><input className={cls} value={data.io_input_file} onChange={e=>update('io_input_file',e.target.value)}/></Field><Field title="Tên file đầu ra"><input className={cls} value={data.io_output_file} onChange={e=>update('io_output_file',e.target.value)}/></Field></>}<Field title="Trình kiểm tra kết quả (Checker)"><select className={cls} value={data.checker} onChange={e=>update('checker',e.target.value)}><option value="standard">Mặc định (so khớp kết quả)</option><option value="floats">Số thực (Floats)</option><option value="bridged">Checker tùy chỉnh</option></select></Field>{data.checker==='bridged'&&<><Field title="Loại checker"><select className={cls} value={data.checker_type} onChange={e=>update('checker_type',e.target.value)}><option value="testlib">Testlib</option><option value="custom">Checker khác</option></select></Field><Field title="File checker"><input type="file" className={cls} onChange={e=>update('custom_checker',e.target.files?.[0]||null)}/></Field></>}{data.grader==='custom'&&<Field title="File trình chấm ngoài"><input type="file" className={cls} onChange={e=>update('custom_grader',e.target.files?.[0]||null)}/></Field>}<Field title="Giới hạn chiều dài output" note="-1: không đặt giới hạn bổ sung"><input type="number" className={cls} value={data.output_limit} onChange={e=>update('output_limit',e.target.value)}/></Field></div>{notice&&<p role="status" className="mt-4 rounded-lg bg-indigo-50 p-3 text-xs text-indigo-700">{notice}</p>}</Section>
<Section title="Danh sách testcase" description="Quản lý điểm, dữ liệu đầu vào/đầu ra và kiểm thử sơ bộ cho từng test."><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">{cases.filter(c=>!c.deleted).length} test · Tổng điểm: <strong>{total}</strong></p><button className={primary} onClick={()=>add(cases.length)}>+ Thêm testcase</button></div><div className="overflow-x-auto"><table className="w-full min-w-[960px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{['#','Loại','Tập tin đầu vào','Tập tin đầu ra','Điểm','Pretest','Xóa'].map(x=><th key={x} className="px-2 py-3">{x}</th>)}</tr></thead><tbody>{cases.filter(c=>!c.deleted).map(c=><tr key={c.id} className="border-t border-slate-100"><td className="px-2">{c.order}</td><td className="px-2"><select className={cls} value={c.type} onChange={e=>patch(c.id,'type',e.target.value)}><option value="normal">Test đơn</option><option value="batch">Nhóm test</option></select></td>{['input_file','output_file'].map(k=><td key={k} className="px-2"><input list="zip-paths" className={cls} placeholder={k==='input_file'?'test01.inp':'test01.out'} value={c[k]} onChange={e=>patch(c.id,k,e.target.value)}/></td>)}<td className="px-2"><input type="number" min="0" step="0.1" className={`${cls} w-20`} value={c.points} onChange={e=>patch(c.id,'points',e.target.value)}/></td><td className="px-2 text-center"><input type="checkbox" checked={c.is_pretest} onChange={e=>patch(c.id,'is_pretest',e.target.checked)}/></td><td className="px-2"><button aria-label="Xóa testcase" className="rounded-lg bg-rose-50 px-3 py-2 font-bold text-rose-600" onClick={()=>patch(c.id,'deleted',true)}>Xóa</button></td></tr>)}</tbody></table><datalist id="zip-paths">{zipFiles.map(f=><option key={f} value={f}/>)}</datalist></div><div className="mt-4 flex justify-end"></div></Section></div>;
}

const stages=[{name:'Thông tin',subtitle:'Thiết lập bài toán',icon:'01'},{name:'Nội dung đề',subtitle:'Đề bài & quyền xem',icon:'02'},{name:'Cấu hình chấm',subtitle:'Giới hạn thực thi',icon:'03'},{name:'Testcase',subtitle:'Dữ liệu kiểm thử',icon:'04'}];
const categories=['Chưa phân loại','Lập trình cơ bản','Cấu trúc dữ liệu','Thuật toán','Đồ thị','Quy hoạch động','Toán học'];
const topics=['Mảng','Chuỗi','Sắp xếp','Tìm kiếm','Tham lam','Đồ thị','Quy hoạch động','Số học','Cấu trúc dữ liệu'];
const Icon=({name,className=''})=>{const paths={back:<path d="m15 18-6-6 6-6"/>,next:<path d="m9 18 6-6-6-6"/>,check:<path d="m5 12 4 4L19 6"/>,save:<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></>,info:<><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,file:<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/></>};return <svg className={className} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>};
const Panel=({eyebrow,title,description,children,aside})=><section className="overflow-hidden rounded-[20px] border border-slate-200/90 bg-white shadow-[0_8px_35px_rgba(28,48,90,.035)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5 sm:px-8"><div><div className="mb-1 text-[10px] font-extrabold uppercase tracking-[.16em] text-indigo-500">{eyebrow}</div><h2 className="text-base font-extrabold tracking-tight text-slate-900">{title}</h2>{description&&<p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}</div>{aside}</div><div className="p-6 sm:p-8">{children}</div></section>;
const FormField=({label,required,hint,children})=><label className="block min-w-0"><span className="mb-2 flex items-center gap-1 text-[12px] font-bold text-slate-700">{label}{required&&<span className="text-rose-500">*</span>}</span>{children}{hint&&<span className="mt-1.5 block text-[11px] leading-relaxed text-slate-400">{hint}</span>}</label>;
const control='w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[13px] text-slate-800 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 placeholder:text-slate-400';
const makeEditorSnapshot=(form,difficulty,selectedTopics)=>JSON.stringify({
  form:{
    name:form.name,
    description:form.description,
    group:form.group,
    points:form.points,
    time_limit:form.time_limit,
    memory_limit:form.memory_limit,
    source:form.source,
    partial:form.partial
  },
  difficulty,
  selectedTopics
});
export default function LcojProblemEditor({onBack,isAdmin,editingProblemId=null}){
  const isEditing=editingProblemId!==null&&editingProblemId!==undefined;
 const [draft]=useState(()=>isEditing?null:readDraft());
  const [zipRestoreWarning]=useState(
    ()=>Boolean(
      !isEditing &&
      draft?.testData?.zip_filename &&
      !draft?.savedProblemId
    )
  );

 const [step,setStep]=useState(()=>draft?.step??0),[unlockedStep,setUnlockedStep]=useState(()=>draft?.unlockedStep??0),[form,setForm]=useState(()=>({...initial,partial:false,...draft?.form,statement_file:null})),[difficulty,setDifficulty]=useState(()=>draft?.difficulty??'medium'),[selectedTopics,setSelectedTopics]=useState(()=>draft?.selectedTopics??[]),[limits,setLimits]=useState(()=>draft?.limits??[{language:'CPP23',time_limit:1,memory_limit:256},{language:'PY3',time_limit:2,memory_limit:256}]),[message,setMessage]=useState(''),[preview,setPreview]=useState(false);
 const [testData,setTestData]=useState(()=>({...initialData,...draft?.testData,zipfile:null,custom_grader:null,custom_checker:null}));
 const [testCases,setTestCases]=useState(()=>Array.isArray(draft?.testCases)?draft.testCases:[makeCase(1)]);
 const [zipFiles,setZipFiles]=useState(()=>draft?.zipFiles??[]);
 const [testNotice,setTestNotice]=useState('');

  const [restoring,setRestoring]=useState(
    ()=>Boolean(isEditing||draft?.savedProblemId)
  );
  const [restoreError,setRestoreError]=useState('');
  const [originalStatus,setOriginalStatus]=useState(null);
  const testcaseRevisionRef=useRef(0);
  const testcaseSavedRevisionRef=useRef(null);
  const savedProblemSnapshotRef=useRef(null);
  const editorSnapshot=()=>makeEditorSnapshot(
    form,difficulty,selectedTopics
  );

  const testcaseChanged=()=>{
    testcaseRevisionRef.current+=1;
  };


 const change=(key,value)=>setForm(f=>({...f,[key]:value}));
 const validate=()=>{if(!form.name.trim()){setMessage('Vui lòng nhập tên bài trước khi tiếp tục.');setStep(0);return false;}if(form.code && !/^[a-zA-Z0-9_]+$/.test(form.code)){setMessage('Mã bài chỉ được chứa chữ cái, số và dấu gạch dưới.');setStep(0);return false;}if(Number(form.time_limit)<=0||Number(form.memory_limit)<=0){setMessage('Giới hạn thời gian và bộ nhớ phải lớn hơn 0.');setStep(0);return false;}setMessage('');return true;};
 const savedProblemIdRef=useRef(isEditing?editingProblemId:(draft?.savedProblemId??null));

  useEffect(()=>{
    const problemId=savedProblemIdRef.current;

    if(!problemId){
      setRestoring(false);
      return;
    }

    let cancelled=false;
    const revision=testcaseRevisionRef.current;

    const restore=async()=>{
      try{
        const result=await ojApi.getManagerProblem(problemId);

        if(!result?.success||!Array.isArray(result?.problem?.testcases)){
          throw new Error('Backend không trả về testcase hợp lệ.');
        }

        if(cancelled)return;

        const rows=result.problem.testcases;

        if(isEditing){
          const problem=result.problem;
          setOriginalStatus(problem.status);
          const metadata=problem.metadata||{};

          setForm({
            ...initial,
            code:String(problem.code||problem.id||''),
            name:problem.title||'',
            description:problem.description||'',
            group:problem.category||'Chưa phân loại',
            points:Number(problem.points||1),
            time_limit:Number(problem.timeLimitMs||1000)/1000,
            memory_limit:Number(problem.memoryLimitMb||256),
            source:metadata.source||'',
            partial:Boolean(metadata.partial),
            statement_file:null
          });

          setDifficulty(
            String(problem.difficulty||'MEDIUM').toLowerCase()
          );

          setSelectedTopics(
            Array.isArray(metadata.topics)?metadata.topics:[]
          );

          setLimits([
            {
              language:'CPP23',
              time_limit:Number(problem.timeLimitMs||1000)/1000,
              memory_limit:Number(problem.memoryLimitMb||256)
            },
            {
              language:'PY3',
              time_limit:Number(problem.timeLimitMs||1000)/1000,
              memory_limit:Number(problem.memoryLimitMb||256)
            }
          ]);

          setStep(0);
          setUnlockedStep(3);
        }

        if(testcaseRevisionRef.current!==revision){
          setRestoring(false);
          return;
        }

        setTestCases(current=>{
          const localByPosition=new Map(
            current.filter(item=>!item.deleted)
              .map((item,index)=>[index+1,item])
          );

          if(!rows.length)return isEditing?[]:current;

          return rows.map(row=>{
            const local=localByPosition.get(Number(row.position))||{};

            return {
              ...makeCase(Number(row.position)),
              ...local,
              order:Number(row.position),
              input_content:row.input,
              output_content:row.output,
              points:row.points,
              type:row.isSample?'sample':'normal',
              deleted:false
            };
          });
        });

        testcaseSavedRevisionRef.current=testcaseRevisionRef.current;
        
        if(isEditing){
          const restored=result.problem;
          const metadata=restored.metadata||{};
          savedProblemSnapshotRef.current=JSON.stringify({
            form:{
              name:restored.title||'',
              description:restored.description||'',
              group:restored.category||'Chưa phân loại',
              points:Number(restored.points||1),
              time_limit:Number(restored.timeLimitMs||1000)/1000,
              memory_limit:Number(restored.memoryLimitMb||256),
              source:metadata.source||'',
              partial:Boolean(metadata.partial)
            },
            difficulty:String(restored.difficulty||'MEDIUM').toLowerCase(),
            selectedTopics:Array.isArray(metadata.topics)?metadata.topics:[]
          });
        }
        setRestoreError('');
        setTestNotice(
          `Đã khôi phục ${rows.length} testcase từ PostgreSQL.`
        );
      }catch(error){
        if(cancelled)return;

        setRestoreError(
          error?.response?.data?.message||
          error?.message||
          'Không thể khôi phục testcase.'
        );
      }finally{
        if(!cancelled)setRestoring(false);
      }
    };

    restore();

    return ()=>{cancelled=true;};
  },[isEditing]);

 useEffect(()=>{
   if(isEditing || restoring)return;
   try {
     sessionStorage.setItem(DRAFT_KEY,JSON.stringify({
       step,unlockedStep,
       form:{...form,statement_file:null},
       difficulty,selectedTopics,limits,
       testData:{...testData,zipfile:null,custom_grader:null,custom_checker:null},
       testCases:testCases.map(item=>Object.fromEntries(Object.entries(item).filter(([key])=>key!=='input_content'&&key!=='output_content'))),
       zipFiles,
       savedProblemId:savedProblemIdRef.current
     }));
   } catch(error) {
     console.warn('Không thể lưu bản nháp OJ:',error);
   }
 },[isEditing,restoring,step,unlockedStep,form,difficulty,selectedTopics,limits,testData,testCases,zipFiles]);
const savingRef=useRef(false);
const [,setSaving]=useState(false);

const save=async(action)=>{
    if(restoring){
        setMessage('Đang khôi phục testcase từ PostgreSQL.');
        return;
    }
    if(restoreError){
        setMessage('Không thể lưu: '+restoreError);
        return;
    }
    if(savingRef.current)return;
    if(!validate())return;

    if(action!=='Lưu nháp'){
        setMessage('Chức năng xuất bản đang được tích hợp. Chưa có dữ liệu nào được gửi.');
        return;
    }

    if(!form.description.trim()){
        setMessage('Vui lòng nhập nội dung đề bài trước khi lưu.');
        setStep(1);
        return;
    }

    const points=Number(form.points);
    const timeLimitMs=Math.round(Number(form.time_limit)*1000);
    const memoryLimitMb=Number(form.memory_limit);

    if(!Number.isInteger(points)||points<=0){
        setMessage('Điểm bài toán phải là số nguyên dương.');
        setStep(0);
        return;
    }

    if(!Number.isInteger(timeLimitMs)||timeLimitMs<=0||timeLimitMs>30000){
        setMessage('Giới hạn thời gian phải từ 1 đến 30000 ms.');
        setStep(0);
        return;
    }

    if(!Number.isInteger(memoryLimitMb)||memoryLimitMb<=0){
        setMessage('Giới hạn bộ nhớ phải là số nguyên dương.');
        setStep(0);
        return;
    }

    const payload={
        title:form.name.trim(),
        description:form.description.trim(),
        category:form.group,
        difficulty:difficulty.toUpperCase(),
        status:originalStatus==='PUBLISHED'?'PUBLISHED':'DRAFT',
        points,
        timeLimitMs,
        memoryLimitMb,
        metadata:{
            source:form.source,
            topics:selectedTopics,
            partial:form.partial
        }
    };

    savingRef.current=true;
    setSaving(true);

    try{
        setMessage('Đang lưu bản nháp...');

        const activeCasesForReview=testCases.filter(item=>!item.deleted);
        const reviewCases=activeCasesForReview.map((item,index)=>{
            if(typeof item.input_content!=='string'||typeof item.output_content!=='string')
                throw new Error(`Testcase ${index+1} thiếu input/output.`);
            const score=Number(item.points);
            if(!Number.isInteger(score)||score<0)
                throw new Error(`Điểm testcase ${index+1} không hợp lệ.`);
            return {input:item.input_content,output:item.output_content,points:score,isSample:item.type==='sample'};
        });
        if(isEditing && originalStatus==='PUBLISHED'){
            if(!reviewCases.length)throw new Error('Bài sửa phải có testcase.');
            const reviewFields={...payload};
            delete reviewFields.status;
            const response=await ojApi.submitReview(savedProblemIdRef.current,{problem:reviewFields,testcases:reviewCases});
            setMessage(response.state==='PENDING_REVIEW'?'Đã gửi phiên bản sửa tới ADMIN_DEV để duyệt.':'Đã áp dụng phiên bản sửa trên môi trường Local.');
            return;
        }

        // Validate all testcase data before writing problem metadata.
        // Prevent creation/update if a later testcase request would
        // predictably fail due to missing data or invalid scores.
        const casesBeforeSave=testCases.filter(item=>!item.deleted);

        if(!casesBeforeSave.length){
            throw new Error(
                'Cần ít nhất một testcase hợp lệ trước khi lưu đề.'
            );
        }

        casesBeforeSave.forEach((item,index)=>{
            if(
                typeof item.input_content!=='string' ||
                typeof item.output_content!=='string'
            ){
                throw new Error(
                    `Testcase ${index+1} thiếu input/output. `+
                    'Hãy nhập lại ZIP hoặc khôi phục testcase.'
                );
            }

            const points=Number(item.points);

            if(!Number.isInteger(points)||points<0){
                throw new Error(
                    `Điểm testcase ${index+1} không hợp lệ.`
                );
            }
        });

        const result=savedProblemIdRef.current
            ? await ojApi.updateProblem(savedProblemIdRef.current,payload)
            : await ojApi.createProblem(payload);

        if(!result?.success||!result?.problem?.id){
            throw new Error('Backend không xác nhận tạo đề thành công.');
        }

        savedProblemIdRef.current=result.problem.id;
        try {
          const previous=readDraft()||{};
          if(!isEditing)sessionStorage.setItem(DRAFT_KEY,JSON.stringify({
            ...previous,savedProblemId:result.problem.id
          }));
        } catch(error) {
          console.warn('Không thể lưu ID bản nháp OJ:',error);
        }
        const problemId=result.problem.id;
        const activeCases=testCases.filter(item=>!item.deleted);

        if(isEditing){
            if(!activeCases.length){
                throw new Error(
                    'Không thể lưu: bài toán không có testcase. '+
                    'Hãy kiểm tra dữ liệu trước khi tiếp tục.'
                );
            }

            const invalidIndex=activeCases.findIndex(item=>
                typeof item.input_content!=='string'||
                typeof item.output_content!=='string'
            );

            if(invalidIndex!==-1){
                throw new Error(
                    `Testcase ${invalidIndex+1} thiếu dữ liệu input/output. `+
                    'Thao tác lưu đã bị chặn.'
                );
            }
        }

        const prepared=activeCases.map((item,index)=>({
            position:index+1,
            input:item.input_content,
            output:item.output_content,
            points:Number(item.points),
            isSample:item.type==='sample'
        }));

        const replacement=await ojApi.replaceTestcases(
            problemId,
            prepared
        );

        if(!replacement?.success ||
           replacement.count!==prepared.length){
            throw new Error(
                'Backend không xác nhận đồng bộ đầy đủ testcase.'
            );
        }

        testcaseSavedRevisionRef.current=testcaseRevisionRef.current;

        setMessage(
            `Đã lưu bản nháp OJ-${problemId} và đồng bộ `+
            `${activeCases.length} testcase vào PostgreSQL.`
        );
    }catch(error){
        setMessage(
            error?.response?.data?.message||
            error?.message||
            'Không thể lưu bản nháp.'
        );
    }finally{
        savingRef.current=false;
        setSaving(false);
    }
};
 const requestReview=async()=>{
    if(isEditing && originalStatus==='PUBLISHED'){
        await save('Lưu nháp');
        return;
    }
    if(restoring||savingRef.current)return;
    if(savedProblemSnapshotRef.current!==editorSnapshot()){
        setMessage(
            'Thông tin đề bài có thay đổi chưa lưu. '+
            'Hãy bấm Lưu nháp thành công trước khi gửi duyệt.'
        );
        return;
    }
    if(testcaseSavedRevisionRef.current!==testcaseRevisionRef.current){
        setMessage(
            'Testcase có thay đổi chưa lưu hoặc chưa được xác nhận. '+
            'Hãy bấm Lưu nháp thành công trước khi gửi duyệt.'
        );
        return;
    }

    const id=savedProblemIdRef.current;
    if(!id){setMessage('Hãy lưu nháp và testcase trước khi gửi duyệt.');return;}
    savingRef.current=true;setSaving(true);
    try{
        const result=await ojApi.getManagerProblem(id);
        if(!result?.success)throw new Error('Không thể kiểm tra bản nháp.');
        const p=result.problem;
        const cases=p.testcases||[];
        if(!cases.length)throw new Error('Chưa có testcase.');
        const response=await ojApi.submitReview(id,{
            problem:{title:p.title,description:p.description,category:p.category,
                difficulty:p.difficulty,points:p.points,timeLimitMs:p.timeLimitMs,
                memoryLimitMb:p.memoryLimitMb,metadata:p.metadata||{}},
            testcases:cases.map(c=>({input:c.input,output:c.output,points:c.points??1,isSample:c.isSample}))
        });
        setMessage(response.state==='PENDING_REVIEW'?'Đã gửi ADMIN_DEV duyệt.':'Đã xuất bản trên môi trường Local.');
    }catch(error){setMessage(error?.response?.data?.message||error?.message||'Không thể gửi duyệt.');}
    finally{savingRef.current=false;setSaving(false);}
 };
 const validateStep=(index)=>{
   if(index===0){
     if(!validate())return false;
     const points=Number(form.points);
     const timeMs=Math.round(Number(form.time_limit)*1000);
     const memory=Number(form.memory_limit);
     if(!Number.isInteger(points)||points<=0){
       setMessage('Điểm bài toán phải là số nguyên dương.');
       return false;
     }
     if(!Number.isInteger(timeMs)||timeMs<=0||timeMs>30000){
       setMessage('Giới hạn thời gian phải từ 1 đến 30 giây.');
       return false;
     }
     if(!Number.isInteger(memory)||memory<=0){
       setMessage('Bộ nhớ phải là số nguyên dương.');
       return false;
     }
     if(!['easy','medium','hard'].includes(difficulty)){
       setMessage('Độ khó hiện chỉ hỗ trợ Dễ, Trung bình hoặc Khó.');
       return false;
     }
   }
   if(index===1&&!form.description.trim()){
     setMessage('Bước 2: Vui lòng nhập nội dung đề bài.');
     return false;
   }
   if(index===2){
     const valid=limits.length===2&&limits.every(item=>{
       const ms=Math.round(Number(item.time_limit)*1000);
       const memory=Number(item.memory_limit);
       return Number.isInteger(ms)&&ms>0&&ms<=30000
         &&Number.isInteger(memory)&&memory>0;
     });
     if(!valid){
       setMessage('Bước 3: Giới hạn thời gian hoặc bộ nhớ không hợp lệ.');
       return false;
     }
   }
   setMessage('');
   return true;
 };
 const goToStep=(target)=>{
   if(target<0||target>3||target>unlockedStep)return;
   if(target>step){
     for(let index=step;index<target;index++){
       if(!validateStep(index)){
         setStep(index);
         return;
       }
     }
   }
   setStep(target);
 };
 const next=()=>{
   if(!validateStep(step))return;
   const target=Math.min(step+1,3);
   setUnlockedStep(current=>Math.max(current,target));
   setStep(target);
   window.scrollTo?.({top:0,behavior:'smooth'});
 };
 return <div className="mx-auto max-w-[1220px] space-y-5 pb-12">
  <div className="flex flex-wrap items-start justify-between gap-4 pt-1"><div className="flex items-start gap-3"><button onClick={onBack} aria-label="Quay lại quản lý đề" className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-indigo-300 hover:text-indigo-600"><Icon name="back"/></button><div><div className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-400"><span>Quản lý đề</span><span>/</span><span className="text-indigo-600">Tạo bài tập</span></div><h1 className="text-[25px] font-extrabold tracking-tight text-slate-900 sm:text-[29px]">Tạo bài tập mới</h1><p className="mt-1 text-[13px] text-slate-500">Thiết lập nội dung, cấu hình chấm và bộ dữ liệu kiểm thử.</p></div></div><div className="flex items-center gap-2"><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-extrabold text-amber-700">● Bản nháp</span><button onClick={()=>save('Lưu nháp')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"><Icon name="save"/>Lưu nháp</button></div></div>
  <div className="grid grid-cols-2 gap-2 rounded-[20px] border border-slate-200 bg-white p-2 shadow-sm lg:grid-cols-4">{stages.map((item,i)=><button key={item.name} onClick={()=>goToStep(i)} disabled={i>unlockedStep} aria-disabled={i>unlockedStep} className={`flex min-w-0 items-center gap-3 rounded-[14px] px-3 py-3 text-left transition sm:px-4 ${step===i?'bg-indigo-50 ring-1 ring-indigo-100':'hover:bg-slate-50'}`}><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold ${step===i?'bg-[#3656db] text-white':i<step?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-400'}`}>{i<step?<Icon name="check"/>:item.icon}</span><span className="min-w-0"><span className={`block truncate text-[12px] font-extrabold ${step===i?'text-indigo-700':'text-slate-700'}`}>{item.name}</span><span className="mt-0.5 hidden truncate text-[10px] text-slate-400 sm:block">{item.subtitle}</span></span></button>)}</div>
  {zipRestoreWarning&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
    Tên tệp ZIP được khôi phục từ phiên làm việc trước, nhưng nội dung testcase chưa được lưu lên máy chủ. Hãy nhập lại ZIP trước khi lưu hoặc gửi duyệt.
  </div>}
  {message&&<div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">{message}</div>}
  {preview?<Panel eyebrow="Bản xem trước" title={form.name||'Bài toán chưa có tên'}><p className="mb-3 text-xs text-slate-500">Mã bài: {form.code||'—'}</p><div className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{form.description||'Chưa có nội dung đề bài.'}</div><button className="mt-5 text-xs font-bold text-indigo-600" onClick={()=>setPreview(false)}>← Trở về chỉnh sửa</button></Panel>:<>
  {step===0&&<div className="space-y-5"><Panel eyebrow="01 / Thông tin" title="Thông tin bài toán" description="Nhập các thông tin nhận diện và phân loại bài tập." aside={<span className="text-[11px] text-slate-400"><span className="text-rose-500">*</span> Bắt buộc</span>}><div className="grid gap-x-6 gap-y-5 md:grid-cols-2"><FormField label="Mã bài" required hint="Chỉ sử dụng chữ cái, chữ số và dấu gạch dưới."><input className={control} value={form.code} onChange={e=>change('code',e.target.value.toUpperCase())} placeholder="VD: ZUNY1001" maxLength={32}/></FormField><FormField label="Tên bài tập" required><input className={control} value={form.name} onChange={e=>change('name',e.target.value)} placeholder="VD: Tổng hai số nguyên"/></FormField><FormField label="Nhóm bài"><select className={control} value={form.group} onChange={e=>change('group',e.target.value)}>{categories.map(x=><option key={x}>{x}</option>)}</select></FormField><FormField label="Độ khó"><select className={control} value={difficulty} onChange={e=>setDifficulty(e.target.value)}><option value="easy">Dễ</option><option value="medium">Trung bình</option><option value="hard">Khó</option><option value="expert">Rất khó</option></select></FormField><FormField label="Nguồn đề" hint="Ví dụ: ZUNY, đề thi học sinh giỏi, đề tự biên soạn."><input className={control} value={form.source} onChange={e=>change('source',e.target.value)} placeholder="Nguồn bài toán (không bắt buộc)"/></FormField><FormField label="Điểm bài toán"><input className={control} type="number" min="0" step="0.1" value={form.points} onChange={e=>change('points',e.target.value)}/></FormField></div><div className="mt-7 border-t border-slate-100 pt-6"><h3 className="mb-3 text-xs font-extrabold text-slate-800">Chủ đề kiến thức</h3><div className="flex flex-wrap gap-2">{topics.map(topic=><button key={topic} onClick={()=>{const next=selectedTopics.includes(topic)?selectedTopics.filter(x=>x!==topic):[...selectedTopics,topic];setSelectedTopics(next);change('types',next.join(','))}} className={`rounded-full border px-3.5 py-2 text-[11px] font-bold transition ${selectedTopics.includes(topic)?'border-indigo-200 bg-indigo-50 text-indigo-700':'border-slate-200 bg-white text-slate-500 hover:border-indigo-200'}`}>{selectedTopics.includes(topic)?'✓ ': '+ '}{topic}</button>)}</div></div></Panel><Panel eyebrow="Giới hạn" title="Giới hạn thực thi" description="Áp dụng mặc định cho bài toán; có thể tùy chỉnh riêng theo ngôn ngữ ở bước 3."><div className="grid gap-5 md:grid-cols-3"><FormField label="Thời gian (giây)"><input className={control} type="number" min="0.1" step="0.1" value={form.time_limit} onChange={e=>change('time_limit',e.target.value)}/></FormField><FormField label="Bộ nhớ (MB)"><input className={control} type="number" min="1" value={form.memory_limit} onChange={e=>change('memory_limit',e.target.value)}/></FormField><FormField label="Chế độ chấm điểm"><select className={control} value={form.partial?'partial':'all'} onChange={e=>change('partial',e.target.value==='partial')}><option value="all">Chỉ tính điểm khi đúng toàn bộ</option><option value="partial">Cho phép điểm từng phần</option></select></FormField></div></Panel></div>}
  {step===1&&<div className="space-y-5"><Panel eyebrow="02 / Nội dung" title="Biên soạn đề bài" description="Soạn bằng Markdown hoặc đính kèm tài liệu PDF."><FormField label="Nội dung đề bài (Markdown)"><textarea className={`${control} min-h-[320px] resize-y font-mono text-[13px] leading-7`} value={form.description} onChange={e=>change('description',e.target.value)} placeholder={'# Yêu cầu\nCho hai số nguyên a và b. Hãy tính tổng a + b.\n\n## Dữ liệu vào\nHai số nguyên a, b.\n\n## Dữ liệu ra\nIn tổng a + b.'}/></FormField><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600 hover:border-indigo-300"><Icon name="file"/><span>{form.statement_file?.name||'Chọn tệp PDF đề bài'}</span><input type="file" className="sr-only" accept="application/pdf" onChange={e=>change('statement_file',e.target.files?.[0]||null)}/></label><button onClick={()=>setPreview(true)} className="text-xs font-bold text-indigo-600 hover:underline">Xem trước nội dung →</button></div></Panel><Panel eyebrow="Quyền truy cập" title="Phạm vi hiển thị"><div className="grid gap-5 md:grid-cols-2"><FormField label="Quyền xem đề"><select className={control} value={form.is_public?'public':'private'} onChange={e=>change('is_public',e.target.value==='public')}><option value="private">Riêng tư / Chưa công khai</option><option value="public">Công khai trong phạm vi cho phép</option></select></FormField><FormField label="Người được xem riêng"><input className={control} value={form.testers} onChange={e=>change('testers',e.target.value)} placeholder="Tên tài khoản, cách nhau bằng dấu phẩy"/></FormField><FormField label="Hiển thị mã nguồn bài nộp"><select className={control} value={form.submission_source_visibility_mode} onChange={e=>change('submission_source_visibility_mode',e.target.value)}><option value="default">Mặc định</option><option value="private">Riêng tư</option><option value="public">Công khai</option></select></FormField><FormField label="Hiển thị testcase"><select className={control} value={form.testcase_visibility_mode} onChange={e=>change('testcase_visibility_mode',e.target.value)}><option value="default">Mặc định</option><option value="private">Ẩn</option><option value="public">Công khai</option></select></FormField></div></Panel></div>}
  {step===2&&<div className="space-y-5"><Panel eyebrow="03 / Cấu hình chấm" title="Ngôn ngữ và giới hạn riêng" description="Cấu hình C++23 và Python 3.14 cho môi trường chấm ZUNY."><div className="space-y-4">{limits.map((item,i)=><div key={item.language} className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 md:grid-cols-3"><FormField label="Ngôn ngữ"><div className="flex h-[46px] items-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-extrabold text-indigo-700">{item.language==='CPP23'?'C++23':'Python 3.14'}</div></FormField>{['time_limit','memory_limit'].map(k=><FormField key={k} label={k==='time_limit'?'Thời gian (giây)':'Bộ nhớ (MB)'}><input className={control} type="number" min="0.1" step="0.1" value={item[k]} onChange={e=>setLimits(list=>list.map((l,j)=>j===i?{...l,[k]:e.target.value}:l))}/></FormField>)}</div>)}</div></Panel><Panel eyebrow="Tùy chọn" title="Chính sách chấm điểm"><label className="flex items-center gap-3 text-[13px] font-semibold text-slate-700"><input type="checkbox" checked={form.partial} onChange={e=>change('partial',e.target.checked)} className="h-4 w-4 accent-indigo-600"/>Cho phép chấm điểm từng phần (Partial scoring)</label><p className="mt-3 text-xs text-slate-500">Các giới hạn và chính sách chỉ là cấu hình giao diện, chưa gửi tới Judge Server.</p></Panel></div>}
  {step===3&&<TestDataEditor data={testData} setData={setTestData} cases={testCases} setCases={updater=>{testcaseChanged();setTestCases(updater);}} zipFiles={zipFiles} setZipFiles={setZipFiles} notice={testNotice} setNotice={setTestNotice} onCasesImported={() => { setRestoreError(''); }} />} 
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm"><button onClick={()=>step===0?onBack():goToStep(step-1)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50"><Icon name="back"/>{step===0?'Quay lại':'Bước trước'}</button><div className="flex items-center gap-2"><span className="mr-2 hidden text-xs text-slate-400 sm:block">Bước {step+1} / 4</span>{step<3?<button onClick={next} className="inline-flex items-center gap-2 rounded-xl bg-[#3656db] px-5 py-3 text-xs font-extrabold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700">Tiếp tục<Icon name="next"/></button>:<button onClick={requestReview} className="inline-flex items-center gap-2 rounded-xl bg-[#3656db] px-5 py-3 text-xs font-extrabold text-white shadow-sm shadow-indigo-200 hover:bg-indigo-700">{isAdmin?'Xuất bản':'Gửi duyệt'}<Icon name="check"/></button>}</div></div>
  </>}
 </div>;
}
