import React from 'react';
import { Divider, Typography } from 'antd';
const { Paragraph, Link, Text } = Typography;

interface Props {
    locale: any
    version: string
    Weather?: string
}
const App: React.FC<Props> = ({ locale, version, Weather }) => (
    <Typography>
        {Weather ? (
            <>
                <Divider style={{ marginBlock: 6 }}>
                    <Text type="secondary"> {locale?.doc?.[0]}</Text>
                </Divider><Paragraph
                    type="secondary"
                    ellipsis={{ rows: 2, expandable: true }}
                >
                    {Weather}
                </Paragraph>
            </>
        ) : null}
        <Divider style={{ margin: 0 }}><Text type="secondary"> v{version}</Text> </Divider>
        <Paragraph type="secondary">
            <Link
                target='_blank'
                href='https://github.com/PIGGYlit/Windows_AutoTheme'
            >{' '}
                GitHub
            </Link>


        </Paragraph>
    </Typography>
);

export default App;