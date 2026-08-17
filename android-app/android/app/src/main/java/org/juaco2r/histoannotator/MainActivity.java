package org.juaco2r.histoannotator;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalImagePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
