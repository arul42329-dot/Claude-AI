package com.jarwis.agent;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.*;
import android.widget.Toast;
import java.util.*;

public class MainActivity extends Activity {
    JarwisView view; SpeechRecognizer recognizer; boolean listening;
    @Override public void onCreate(Bundle state) { super.onCreate(state); getWindow().setStatusBarColor(Color.rgb(11,15,20)); view = new JarwisView(); setContentView(view); }
    void listen() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) { toast("Voice input is unavailable on this device"); return; }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 42); return; }
        if (listening) { recognizer.stopListening(); return; }
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            public void onReadyForSpeech(Bundle b) { listening=true; view.invalidate(); }
            public void onBeginningOfSpeech() {}
            public void onRmsChanged(float r) { view.level = Math.min(1f, r / 10f); view.invalidate(); }
            public void onBufferReceived(byte[] b) {}
            public void onEndOfSpeech() { listening=false; view.invalidate(); }
            public void onError(int e) { listening=false; view.invalidate(); toast("I couldn't hear that. Try again."); }
            public void onResults(Bundle b) { ArrayList<String> results=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION); if(results!=null&&!results.isEmpty()) handle(results.get(0)); }
            public void onPartialResults(Bundle b) {}
            public void onEvent(int a, Bundle b) {}
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH); i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM); i.putExtra(RecognizerIntent.EXTRA_PROMPT, "What can I do for you?"); recognizer.startListening(i);
    }
    void handle(String text) {
        String command=text.toLowerCase(Locale.US); view.lastCommand=text; view.activity = text; view.invalidate();
        if(command.contains("navigate") || command.contains("map") || command.contains("direction")) { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("geo:0,0?q=" + Uri.encode(text.replaceAll("(?i).*?(to|map)\\s+", ""))))); }
        else if(command.contains("call")) { new android.app.AlertDialog.Builder(this).setTitle("Confirm call").setMessage("JARWIS is ready to open the dialer. Continue?").setNegativeButton("Cancel",null).setPositiveButton("Open dialer",(d,w)->startActivity(new Intent(Intent.ACTION_DIAL, Uri.parse("tel:")))).show(); }
        else if(command.contains("text") || command.contains("message")) { startActivity(new Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:"))); }
        else if(command.contains("music") || command.contains("playlist")) { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://music.youtube.com"))); }
        else toast("I heard: " + text);
    }
    void toast(String text) { Toast.makeText(this,text,Toast.LENGTH_SHORT).show(); }
    @Override protected void onDestroy(){ if(recognizer!=null) recognizer.destroy(); super.onDestroy(); }

    class JarwisView extends View {
        Paint p=new Paint(3); float density; float level=0; String lastCommand=""; String activity="Morning briefing ready"; RectF orb=new RectF();
        int bg=Color.rgb(11,15,20), panel=Color.rgb(17,23,31), muted=Color.rgb(132,144,156), white=Color.rgb(242,245,247), lime=Color.rgb(201,245,90);
        JarwisView(){ super(MainActivity.this); density=getResources().getDisplayMetrics().density; p.setTypeface(Typeface.create("sans",Typeface.NORMAL)); setLayerType(View.LAYER_TYPE_SOFTWARE,null); }
        float d(float v){return v*density;} void txt(Canvas c,String s,float x,float y,float size,int color){p.setStyle(Paint.Style.FILL);p.setColor(color);p.setTextSize(d(size));p.setTypeface(Typeface.create("sans",Typeface.NORMAL));c.drawText(s,x,y,p);} void bold(Canvas c,String s,float x,float y,float size,int color){p.setTypeface(Typeface.create("sans",Typeface.BOLD));p.setTextSize(d(size));p.setColor(color);c.drawText(s,x,y,p);p.setTypeface(Typeface.DEFAULT);}
        void round(Canvas c,float l,float t,float r,float b,float rad,int color){p.setStyle(Paint.Style.FILL);p.setColor(color);c.drawRoundRect(d(l),d(t),d(r),d(b),d(rad),d(rad),p);}
        @Override protected void onDraw(Canvas c){super.onDraw(c); c.drawColor(bg); float w=getWidth()/density;
            txt(c,"J",20,38,18,lime); bold(c,"JARWIS",49,37,13,white); txt(c,"●",w-45,37,11,lime); txt(c,"⋮",w-26,38,22,muted);
            txt(c,"THURSDAY · OCTOBER 03",20,94,10,muted); bold(c,"Good morning,",20,126,25,white); bold(c,"Alex.",177,126,25,lime); txt(c,"What can I take care of?",20,149,13,muted);
            round(c,20,174,w-20,488,24,Color.rgb(20,31,27)); txt(c,"☼",w-67,204,23,Color.rgb(255,179,107)); txt(c,"72°",w-43,202,17,white);
            float cx=w/2, cy=278; orb.set(d(cx-62),d(cy-62),d(cx+62),d(cy+62)); p.setShader(new RadialGradient(d(cx-22),d(cy-28),d(105),new int[]{Color.rgb(238,254,185),lime,Color.rgb(28,43,37)},null,Shader.TileMode.CLAMP)); c.drawCircle(d(cx),d(cy),d(58+level*5),p);p.setShader(null); p.setStyle(Paint.Style.STROKE);p.setStrokeWidth(d(1));p.setColor(lime);c.drawCircle(d(cx),d(cy),d(62),p);p.setStyle(Paint.Style.FILL);
            txt(c,listening?"LISTENING…":"TAP TO SPEAK",cx-p.measureText(listening?"LISTENING…":"TAP TO SPEAK")/2,374,11,lime); String sub=lastCommand.length()>0?"“"+lastCommand+"”":"Say “Hey Jarwis” or tap the orb"; txt(c,sub,cx-p.measureText(sub)/2,396,11,muted);
            pill(c,30,426,"Set a timer"); pill(c,132,426,"My calendar"); pill(c,231,426,"Text Mom");
            bold(c,"Quick actions",20,535,15,white); txt(c,"Customize  ›",w-86,535,11,muted); tile(c,20,554,"⌕","Call Mom","Phone",Color.rgb(173,147,255));tile(c,w/2+4,554,"▶","Focus playlist","Music",Color.rgb(255,179,107));tile(c,20,632,"◒","Do not disturb","Focus",Color.rgb(114,187,255));tile(c,w/2+4,632,"⌖","Navigate to work","Maps",Color.rgb(117,226,164));
            bold(c,"Recent activity",20,735,15,white); txt(c,"Clear  ›",w-58,735,11,muted); round(c,20,754,w-20,816,15,panel); txt(c,"✓",35,790,17,Color.rgb(117,226,164)); bold(c,activity.length()>26?activity.substring(0,26)+"…":activity,70,786,11,white); txt(c,"Just now",w-75,786,10,muted);
            txt(c,"♢",20,860,23,lime);bold(c,"Your control, always.",51,858,10,white);txt(c,"JARWIS asks before sensitive actions.",51,875,9,muted);
            p.setColor(Color.rgb(14,20,26));c.drawRect(0,getHeight()-d(70),getWidth(),getHeight(),p);txt(c,"⌂",w*.13f,getHeight()/density-39,20,lime);txt(c,"◷",w*.37f,getHeight()/density-39,20,muted);txt(c,"◉",w*.62f,getHeight()/density-39,20,muted);txt(c,"○",w*.87f,getHeight()/density-39,20,muted);txt(c,"Home",w*.13f-10,getHeight()/density-17,9,lime);txt(c,"Activity",w*.34f,getHeight()/density-17,9,muted);txt(c,"Permissions",w*.57f,getHeight()/density-17,9,muted);txt(c,"Profile",w*.84f,getHeight()/density-17,9,muted);
        }
        void pill(Canvas c,float x,float y,String s){round(c,x,y,x+92,y+30,18,Color.rgb(31,39,43));txt(c,s,x+10,y+19,10,muted);}
        void tile(Canvas c,float x,float y,String icon,String title,String sub,int color){round(c,x,y,x+((getWidth()/density-49)/2),y+67,14,panel);txt(c,icon,x+13,y+28,17,color);bold(c,title,x+43,y+26,10,white);txt(c,sub,x+43,y+43,9,muted);}
        @Override public boolean onTouchEvent(android.view.MotionEvent e){if(e.getAction()!=MotionEvent.ACTION_UP)return true;float x=e.getX()/density,y=e.getY()/density,w=getWidth()/density;if(y>205&&y<360){listen();return true;}if(y>420&&y<475){ if(x<125)handle("Set a timer for 10 minutes"); else if(x<225)handle("Show my calendar today"); else handle("Text Mom"); return true;}if(y>550&&y<710){if(x<w/2)handle(y<625?"Call Mom":"Turn on do not disturb");else handle(y<625?"Play my focus playlist":"Navigate to work");return true;}return true;}
    }
}
